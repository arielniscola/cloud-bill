import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * Base local del navegador para trabajar sin conexion.
 *
 * Guarda SOLO lo necesario para vender: catalogo, precios, stock, clientes y
 * la cabecera de la empresa. Todo lo demas (facturas, compras, contabilidad)
 * sigue viviendo unicamente en el servidor.
 *
 * Los montos llegan del backend como string (Prisma Decimal) y se guardan tal
 * cual: convertirlos a number acá perderia precision antes de tiempo.
 */

export interface CachedProduct {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  unit: string | null;
  price: string;
  salePriceUSD: string | null;
  taxRate: string;
  trackStock: boolean;
  isActive: boolean;
  rubroId: string | null;
  brandId: string | null;
  categoryId: string | null;
  priceUpdatedAt: string | null;
  updatedAt: string;
  /** Campo derivado, solo para el indice de busqueda. No viene del backend. */
  searchText?: string;
}

export interface CachedProductVariant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  attributes: Record<string, unknown>;
  priceOverride: string | null;
  barcode: string | null;
  isActive: boolean;
  updatedAt: string;
}

export interface CachedCustomer {
  id: string;
  name: string;
  taxId: string | null;
  taxCondition: string;
  saleCondition: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  updatedAt: string;
  searchText?: string;
}

export interface CachedStock {
  id: string;
  productId: string;
  variantId: string | null;
  warehouseId: string;
  quantity: string;
  reservedQuantity: string;
  minQuantity: string | null;
  updatedAt: string;
}

export interface CachedWarehouse {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  updatedAt: string;
}

/** Fila unica con la cabecera de la empresa y su config (clave fija). */
export interface CachedSingleton {
  key: 'company' | 'afipConfig' | 'appSettings';
  value: unknown;
}

export type OutboxStatus = 'PENDING' | 'SENDING' | 'FAILED' | 'SENT';

/**
 * Una venta hecha sin conexion, esperando subir.
 *
 * `clientUuid` es la clave y viaja como Idempotency-Key: el servidor lo usa
 * para no crear dos veces la misma venta si un reintento se superpone con un
 * envio que en realidad si habia llegado.
 */
export interface OutboxSale {
  clientUuid: string;
  type: 'ORDEN_PEDIDO';
  /** El mismo payload que recibiria POST /orden-pedidos. */
  payload: unknown;
  /** Numero local para el ticket, hasta que el servidor asigne el definitivo. */
  provisionalNumber: string;
  deviceId: string;
  status: OutboxStatus;
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  /** Quien y donde la cargo, para no subirla bajo otra sesion o empresa. */
  userId: string | null;
  companyId: string | null;
  /**
   * Descuentos de stock aplicados a la cache al encolar, para poder revertirlos
   * si la venta se descarta. Clave = id de la fila de stocks.
   */
  stockDeltas: Array<{ stockId: string; quantity: number }>;
  /** Total, solo para mostrar en la lista sin re-parsear el payload. */
  total: string;
  customerName: string | null;
  /** Numero definitivo que devolvio el servidor, una vez subida. */
  serverNumber?: string | null;
  serverId?: string | null;
}

/** Estado de la sincronizacion, una sola fila por clave. */
export interface CacheMeta {
  key: 'catalog';
  /** Cursor `syncedAt` de la ultima corrida exitosa. */
  lastSyncAt: string | null;
  /** Momento en que se guardaron los datos (reloj del navegador). */
  storedAt: string | null;
  /** Totales que reporto el servidor, para detectar borrados. */
  counts: Record<string, number> | null;
  /** Empresa a la que pertenecen estos datos. */
  companyId: string | null;
  lastError: string | null;
}

interface CloudBillDB extends DBSchema {
  products: {
    key: string;
    value: CachedProduct;
    indexes: { 'by-sku': string; 'by-barcode': string };
  };
  productVariants: {
    key: string;
    value: CachedProductVariant;
    indexes: { 'by-product': string };
  };
  customers: {
    key: string;
    value: CachedCustomer;
  };
  stocks: {
    key: string;
    value: CachedStock;
    indexes: { 'by-product': string; 'by-warehouse': string };
  };
  warehouses: {
    key: string;
    value: CachedWarehouse;
  };
  singletons: {
    key: string;
    value: CachedSingleton;
  };
  meta: {
    key: string;
    value: CacheMeta;
  };
  outbox: {
    key: string;
    value: OutboxSale;
    indexes: { 'by-status': string; 'by-created': string };
  };
}

export type OfflineDB = IDBPDatabase<CloudBillDB>;

const DB_NAME = 'cloud-bill-offline';
// v2: se agrego el store `outbox` (ventas hechas sin conexion).
const DB_VERSION = 2;

let dbPromise: Promise<OfflineDB> | null = null;

export function getDB(): Promise<OfflineDB> {
  if (!dbPromise) {
    dbPromise = openDB<CloudBillDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('products')) {
          const s = db.createObjectStore('products', { keyPath: 'id' });
          s.createIndex('by-sku', 'sku');
          s.createIndex('by-barcode', 'barcode');
        }
        if (!db.objectStoreNames.contains('productVariants')) {
          const s = db.createObjectStore('productVariants', { keyPath: 'id' });
          s.createIndex('by-product', 'productId');
        }
        if (!db.objectStoreNames.contains('customers')) {
          db.createObjectStore('customers', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('stocks')) {
          const s = db.createObjectStore('stocks', { keyPath: 'id' });
          s.createIndex('by-product', 'productId');
          s.createIndex('by-warehouse', 'warehouseId');
        }
        if (!db.objectStoreNames.contains('warehouses')) {
          db.createObjectStore('warehouses', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('singletons')) {
          db.createObjectStore('singletons', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('outbox')) {
          const s = db.createObjectStore('outbox', { keyPath: 'clientUuid' });
          s.createIndex('by-status', 'status');
          s.createIndex('by-created', 'createdAt');
        }
      },
      blocked() {
        console.warn('[offline] otra pestaña esta bloqueando la actualizacion de la base local');
      },
    });
  }
  return dbPromise;
}

/**
 * Borra el catalogo cacheado. Se usa al cerrar sesion y al cambiar de empresa:
 * los datos de una empresa no pueden quedar visibles en otra.
 *
 * NUNCA toca `outbox`: ahi viven ventas que todavia no llegaron al servidor y
 * solo existen en esta maquina. Borrarlas al desloguear seria perder plata.
 */
export async function clearCache(): Promise<void> {
  const db = await getDB();
  const stores = [
    'products',
    'productVariants',
    'customers',
    'stocks',
    'warehouses',
    'singletons',
    'meta',
  ] as const;
  const tx = db.transaction(stores, 'readwrite');
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  await tx.done;
}

/** Ventas encoladas sin subir. Se consulta antes de dejar cerrar sesion. */
export async function countUnsentSales(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll('outbox');
  return all.filter((r) => r.status !== 'SENT').length;
}

/**
 * Pide al navegador que no descarte estos datos cuando le falte espacio.
 * Importante de cara a la Fase 3: si el navegador limpia el sitio, se pierde
 * la cola de ventas pendientes.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
