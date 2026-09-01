import api from '../../services/api';
import { useAuthStore } from '../../stores/auth.store';
import { useCompanyStore } from '../../stores/company.store';
import {
  getDB,
  clearCache,
  requestPersistentStorage,
  type CacheMeta,
  type CachedCustomer,
  type CachedProduct,
  type CachedStock,
  type CachedWarehouse,
} from './db';

/** Stores que el snapshot reemplaza/actualiza, en el orden en que se escriben. */
const DATA_STORES = [
  'products',
  'productVariants',
  'customers',
  'stocks',
  'warehouses',
] as const;

interface SnapshotResponse {
  status: string;
  syncedAt: string;
  since: string | null;
  full: boolean;
  data: {
    products: CachedProduct[];
    productVariants: unknown[];
    customers: CachedCustomer[];
    stocks: CachedStock[];
    warehouses: CachedWarehouse[];
    company: unknown;
    afipConfig: unknown;
    appSettings: unknown;
  };
  counts: Record<string, number>;
}

export interface CatalogSyncResult {
  ok: boolean;
  full: boolean;
  syncedAt: string | null;
  applied: Record<string, number>;
  error?: string;
}

/** Normaliza para buscar: minusculas y sin acentos. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function currentCompanyId(): string | null {
  return (
    useCompanyStore.getState().activeCompanyId ??
    useAuthStore.getState().user?.companyId ??
    null
  );
}

const EMPTY_META: CacheMeta = {
  key: 'catalog',
  lastSyncAt: null,
  storedAt: null,
  counts: null,
  companyId: null,
  lastError: null,
};

export async function getCatalogMeta(): Promise<CacheMeta> {
  const db = await getDB();
  return (await db.get('meta', 'catalog')) ?? EMPTY_META;
}

async function writeMeta(patch: Partial<CacheMeta>): Promise<void> {
  const db = await getDB();
  const current = (await db.get('meta', 'catalog')) ?? EMPTY_META;
  await db.put('meta', { ...current, ...patch, key: 'catalog' });
}

/** Edad de la cache en minutos, o null si nunca se sincronizo. */
export async function getCacheAgeMinutes(): Promise<number | null> {
  const meta = await getCatalogMeta();
  if (!meta.storedAt) return null;
  return Math.floor((Date.now() - new Date(meta.storedAt).getTime()) / 60000);
}

/**
 * Descarga el snapshot y lo aplica a la base local.
 *
 * - Sin `since` (o con `force`) reemplaza todo.
 * - Con `since` aplica solo lo que cambio.
 * - Si los totales locales no coinciden con los del servidor, algo se borro:
 *   se repite una vez en modo completo. Es la unica forma de enterarse de un
 *   DELETE, porque un delta por `updatedAt` nunca lo propaga.
 */
export async function syncCatalog(
  options: { force?: boolean } = {}
): Promise<CatalogSyncResult> {
  const companyId = currentCompanyId();
  const meta = await getCatalogMeta();

  // Cambio de empresa: lo cacheado no sirve y no puede mezclarse.
  const companyChanged = meta.companyId !== null && meta.companyId !== companyId;
  const full = options.force || companyChanged || !meta.lastSyncAt;

  try {
    const result = await runSync(full ? null : meta.lastSyncAt, companyId);

    // Segunda pasada solo si el delta dejo la cache descuadrada.
    if (!full && result.drifted) {
      const repaired = await runSync(null, companyId);
      return {
        ok: true,
        full: true,
        syncedAt: repaired.syncedAt,
        applied: repaired.applied,
      };
    }

    return { ok: true, full, syncedAt: result.syncedAt, applied: result.applied };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeMeta({ lastError: message });
    return { ok: false, full, syncedAt: null, applied: {}, error: message };
  }
}

async function runSync(since: string | null, companyId: string | null) {
  const res = await api.get<SnapshotResponse>('/catalog/snapshot', {
    params: since ? { since } : undefined,
  });
  const payload = res.data;
  const isFull = payload.full;

  const db = await getDB();
  const tx = db.transaction(
    [...DATA_STORES, 'singletons', 'meta'],
    'readwrite'
  );

  // Un snapshot completo reemplaza; un delta se superpone.
  if (isFull) {
    await Promise.all(DATA_STORES.map((s) => tx.objectStore(s).clear()));
  }

  const applied: Record<string, number> = {};

  const products = payload.data.products ?? [];
  for (const p of products) {
    await tx.objectStore('products').put({
      ...p,
      searchText: normalize(`${p.sku} ${p.name} ${p.barcode ?? ''}`),
    });
  }
  applied.products = products.length;

  const variants = (payload.data.productVariants ?? []) as any[];
  for (const v of variants) await tx.objectStore('productVariants').put(v);
  applied.productVariants = variants.length;

  const customers = payload.data.customers ?? [];
  for (const c of customers) {
    await tx.objectStore('customers').put({
      ...c,
      searchText: normalize(`${c.name} ${c.taxId ?? ''}`),
    });
  }
  applied.customers = customers.length;

  const stocks = payload.data.stocks ?? [];
  for (const s of stocks) await tx.objectStore('stocks').put(s);
  applied.stocks = stocks.length;

  const warehouses = payload.data.warehouses ?? [];
  for (const w of warehouses) await tx.objectStore('warehouses').put(w);
  applied.warehouses = warehouses.length;

  const singletons = tx.objectStore('singletons');
  await singletons.put({ key: 'company', value: payload.data.company });
  await singletons.put({ key: 'afipConfig', value: payload.data.afipConfig });
  await singletons.put({ key: 'appSettings', value: payload.data.appSettings });

  await tx.objectStore('meta').put({
    key: 'catalog',
    lastSyncAt: payload.syncedAt,
    storedAt: new Date().toISOString(),
    counts: payload.counts,
    companyId,
    lastError: null,
  });

  await tx.done;

  // Comparar totales DESPUES de cerrar la transaccion de escritura.
  const drifted = await hasDrift(payload.counts);

  void requestPersistentStorage();

  return { syncedAt: payload.syncedAt, applied, drifted };
}

/** true si lo que hay guardado no coincide con lo que dice el servidor. */
async function hasDrift(serverCounts: Record<string, number>): Promise<boolean> {
  if (!serverCounts) return false;
  const db = await getDB();
  for (const store of DATA_STORES) {
    const expected = serverCounts[store];
    if (typeof expected !== 'number') continue;
    if ((await db.count(store)) !== expected) return true;
  }
  return false;
}

// ─── Lecturas locales ────────────────────────────────────────────────────────

/**
 * Busca productos en la cache local. Reemplaza al `serverSearch` de
 * ProductSearchSelect cuando no hay conexion.
 */
export async function searchProductsLocal(
  query: string,
  limit = 20
): Promise<CachedProduct[]> {
  const db = await getDB();
  const q = normalize(query.trim());
  const out: CachedProduct[] = [];

  let cursor = await db.transaction('products').store.openCursor();
  while (cursor && out.length < limit) {
    const p = cursor.value;
    if (p.isActive && (!q || (p.searchText ?? '').includes(q))) out.push(p);
    cursor = await cursor.continue();
  }

  // Los que empiezan con lo buscado van primero.
  if (q) {
    out.sort((a, b) => {
      const aStarts = normalize(a.sku).startsWith(q) || normalize(a.name).startsWith(q);
      const bStarts = normalize(b.sku).startsWith(q) || normalize(b.name).startsWith(q);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }
  return out;
}

export async function searchCustomersLocal(
  query: string,
  limit = 20
): Promise<CachedCustomer[]> {
  const db = await getDB();
  const q = normalize(query.trim());
  const out: CachedCustomer[] = [];

  let cursor = await db.transaction('customers').store.openCursor();
  while (cursor && out.length < limit) {
    const c = cursor.value;
    if (c.isActive && (!q || (c.searchText ?? '').includes(q))) out.push(c);
    cursor = await cursor.continue();
  }
  return out;
}

export async function getProductLocal(id: string): Promise<CachedProduct | undefined> {
  return (await getDB()).get('products', id);
}

export async function getCustomerLocal(id: string): Promise<CachedCustomer | undefined> {
  return (await getDB()).get('customers', id);
}

export async function findProductByBarcodeLocal(
  barcode: string
): Promise<CachedProduct | undefined> {
  const db = await getDB();
  return db.getFromIndex('products', 'by-barcode', barcode);
}

/**
 * Stock de un producto. Ojo: es una FOTO del ultimo sync, no una reserva.
 * Dos cajas offline pueden vender la misma ultima unidad.
 */
export async function getStockLocal(
  productId: string,
  warehouseId?: string
): Promise<CachedStock[]> {
  const db = await getDB();
  const rows = await db.getAllFromIndex('stocks', 'by-product', productId);
  return warehouseId ? rows.filter((r) => r.warehouseId === warehouseId) : rows;
}

/**
 * Fila de stock exacta de un producto en un deposito (y variante, si tiene).
 * Es la fila que hay que descontar al encolar una venta offline.
 */
export async function findStockRowLocal(
  productId: string,
  warehouseId: string,
  variantId: string | null = null
): Promise<CachedStock | undefined> {
  const rows = await getStockLocal(productId, warehouseId);
  return rows.find((r) => (r.variantId ?? null) === variantId);
}

/** Disponible = quantity - reservedQuantity, la regla de siempre. */
export function availableQty(stock: CachedStock): number {
  return Number(stock.quantity) - Number(stock.reservedQuantity);
}

export async function getWarehousesLocal(): Promise<CachedWarehouse[]> {
  return (await getDB()).getAll('warehouses');
}

export async function getSingletonLocal<T>(
  key: 'company' | 'afipConfig' | 'appSettings'
): Promise<T | null> {
  const row = await (await getDB()).get('singletons', key);
  return (row?.value as T) ?? null;
}

export { clearCache };
