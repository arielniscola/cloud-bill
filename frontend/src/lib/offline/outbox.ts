import { useAuthStore } from '../../stores/auth.store';
import { useCompanyStore } from '../../stores/company.store';
import { getDB, type OutboxSale, type OutboxStatus } from './db';

/**
 * Cola de ventas hechas sin conexion.
 *
 * Encolar es un acto deliberado y atomico: la venta entra en `outbox` y, si
 * descuenta stock, el descuento se aplica a la cache local en la MISMA
 * transaccion. Asi la segunda venta del dia ve el stock correcto y nunca queda
 * una venta guardada con el stock sin tocar (ni al reves).
 *
 * Lo que NO hace este modulo es subirlas: eso es la Fase 4.
 */

const DEVICE_KEY = 'cloud-bill-device-id';
const COUNTER_KEY = 'cloud-bill-offline-counter';

/**
 * Id estable de esta terminal. Va en el numero provisional para que dos cajas
 * offline no generen el mismo, y viaja con la venta para poder rastrear de
 * donde salio.
 */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/** Sufijo corto y legible del device, para el ticket. */
function deviceTag(): string {
  return getDeviceId().replace(/-/g, '').slice(0, 4).toUpperCase();
}

function nextCounter(): number {
  const n = Number(localStorage.getItem(COUNTER_KEY) ?? '0') + 1;
  localStorage.setItem(COUNTER_KEY, String(n));
  return n;
}

/**
 * Numero provisional: `OFF-A1B2-000007`.
 *
 * Se imprime en el ticket rotulado como provisional. El definitivo lo asigna
 * SIEMPRE el servidor al subir la venta: `OrdenPedido.number` es unique global
 * y numerarlo aca garantizaria colisiones.
 */
export function makeProvisionalNumber(): string {
  return `OFF-${deviceTag()}-${String(nextCounter()).padStart(6, '0')}`;
}

export interface EnqueueSaleInput {
  /** El payload tal cual lo recibiria POST /orden-pedidos. */
  payload: unknown;
  /** Descuentos a aplicar sobre la cache local (vacio si no descuenta stock). */
  stockDeltas: Array<{ stockId: string; quantity: number }>;
  total: string;
  customerName: string | null;
}

/**
 * Guarda la venta y descuenta el stock cacheado en una sola transaccion.
 * Devuelve el registro encolado (con su numero provisional).
 */
export async function enqueueSale(input: EnqueueSaleInput): Promise<OutboxSale> {
  const db = await getDB();
  const record: OutboxSale = {
    clientUuid: crypto.randomUUID(),
    type: 'ORDEN_PEDIDO',
    payload: input.payload,
    provisionalNumber: makeProvisionalNumber(),
    deviceId: getDeviceId(),
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    userId: useAuthStore.getState().user?.id ?? null,
    companyId:
      useCompanyStore.getState().activeCompanyId ??
      useAuthStore.getState().user?.companyId ??
      null,
    stockDeltas: input.stockDeltas,
    total: input.total,
    customerName: input.customerName,
  };

  const tx = db.transaction(['outbox', 'stocks'], 'readwrite');
  await tx.objectStore('outbox').put(record);

  const stocksStore = tx.objectStore('stocks');
  for (const delta of input.stockDeltas) {
    const row = await stocksStore.get(delta.stockId);
    if (!row) continue;
    // Se permite quedar en negativo a proposito: refleja que se vendio de mas
    // y que hay que revisarlo al reconectar, en vez de esconderlo en un 0.
    await stocksStore.put({
      ...row,
      quantity: String(Number(row.quantity) - delta.quantity),
    });
  }

  await tx.done;
  return record;
}

export async function listSales(): Promise<OutboxSale[]> {
  const db = await getDB();
  const all = await db.getAll('outbox');
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Ventas que todavia no llegaron al servidor, en orden de creacion (FIFO). */
export async function listUnsent(): Promise<OutboxSale[]> {
  return (await listSales()).filter((r) => r.status !== 'SENT');
}

export async function countUnsent(): Promise<number> {
  return (await listUnsent()).length;
}

export async function getSale(clientUuid: string): Promise<OutboxSale | undefined> {
  return (await getDB()).get('outbox', clientUuid);
}

export async function updateSale(
  clientUuid: string,
  patch: Partial<OutboxSale>
): Promise<void> {
  const db = await getDB();
  const current = await db.get('outbox', clientUuid);
  if (!current) return;
  await db.put('outbox', { ...current, ...patch, clientUuid });
}

export async function markStatus(
  clientUuid: string,
  status: OutboxStatus,
  error: string | null = null
): Promise<void> {
  const db = await getDB();
  const current = await db.get('outbox', clientUuid);
  if (!current) return;
  await db.put('outbox', {
    ...current,
    status,
    lastError: error,
    lastAttemptAt: new Date().toISOString(),
    attempts: status === 'SENDING' ? current.attempts + 1 : current.attempts,
  });
}

/**
 * Descarta una venta encolada y devuelve el stock que habia descontado.
 *
 * Es destructivo y sin vuelta atras: la venta solo existe en esta maquina, asi
 * que quien llama tiene que haber confirmado con el usuario.
 */
export async function discardSale(clientUuid: string): Promise<void> {
  const db = await getDB();
  const record = await db.get('outbox', clientUuid);
  if (!record) return;

  const tx = db.transaction(['outbox', 'stocks'], 'readwrite');
  const stocksStore = tx.objectStore('stocks');
  for (const delta of record.stockDeltas) {
    const row = await stocksStore.get(delta.stockId);
    if (!row) continue;
    await stocksStore.put({
      ...row,
      quantity: String(Number(row.quantity) + delta.quantity),
    });
  }
  await tx.objectStore('outbox').delete(clientUuid);
  await tx.done;
}

/** Limpia las ya subidas. El historial real vive en el servidor. */
export async function purgeSent(): Promise<number> {
  const db = await getDB();
  const sent = (await db.getAll('outbox')).filter((r) => r.status === 'SENT');
  const tx = db.transaction('outbox', 'readwrite');
  for (const r of sent) await tx.store.delete(r.clientUuid);
  await tx.done;
  return sent.length;
}
