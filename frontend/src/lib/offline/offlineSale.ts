import {
  availableQty,
  findStockRowLocal,
  getProductLocal,
  getStockLocal,
} from './catalogCache';
import { enqueueSale, type EnqueueSaleInput } from './outbox';
import type { OutboxSale } from './db';

/**
 * Puente entre el formulario de venta y la cola offline.
 *
 * Resuelve dos cosas que el formulario hoy hace contra el backend:
 *  - validar stock (`stockService.getProductStock`)
 *  - guardar la venta (`ordenPedidosService.create`)
 */

export interface SaleItemLike {
  productId?: string | null;
  variantId?: string | null;
  quantity: number;
}

export interface StockWarning {
  productName: string;
  requested: number;
  available: number;
}

/**
 * Valida stock contra la cache local.
 *
 * OJO: es una FOTO del ultimo sync, no una reserva. Dos cajas offline pueden
 * pasar esta validacion y vender la misma ultima unidad. Por eso el resultado
 * se muestra como advertencia y no como bloqueo duro.
 */
export async function checkStockOffline(
  items: SaleItemLike[],
  warehouseId: string | null
): Promise<StockWarning[]> {
  const requested = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);
  }
  if (requested.size === 0) return [];

  const warnings: StockWarning[] = [];
  for (const [productId, qty] of requested) {
    const product = await getProductLocal(productId);
    // Los no inventariados (servicios) no validan stock, igual que en el server.
    if (product && !product.trackStock) continue;

    const rows = await getStockLocal(productId, warehouseId ?? undefined);
    const available = rows.reduce((sum, r) => sum + availableQty(r), 0);
    if (qty > available) {
      warnings.push({
        productName: product?.name ?? productId,
        requested: qty,
        available,
      });
    }
  }
  return warnings;
}

/**
 * Calcula que filas de stock hay que descontar y cuanto.
 * Devuelve vacio si la venta no descuenta stock (RESERVE o sin deposito).
 */
async function buildStockDeltas(
  items: SaleItemLike[],
  warehouseId: string | null,
  stockBehavior: string
): Promise<Array<{ stockId: string; quantity: number }>> {
  if (stockBehavior !== 'DISCOUNT' || !warehouseId) return [];

  const deltas = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    const product = await getProductLocal(item.productId);
    if (product && !product.trackStock) continue;

    const row = await findStockRowLocal(
      item.productId,
      warehouseId,
      item.variantId ?? null
    );
    // Sin fila de stock no hay nada que descontar: el servidor la creara al
    // procesar la venta.
    if (!row) continue;
    deltas.set(row.id, (deltas.get(row.id) ?? 0) + item.quantity);
  }
  return Array.from(deltas, ([stockId, quantity]) => ({ stockId, quantity }));
}

export interface QueueSaleOptions {
  payload: Record<string, unknown>;
  items: SaleItemLike[];
  warehouseId: string | null;
  stockBehavior: string;
  total: number;
  customerName: string | null;
}

/**
 * Encola una venta hecha sin conexion y descuenta el stock cacheado.
 * Devuelve el registro, cuyo `provisionalNumber` va al ticket.
 */
export async function queueSaleOffline(
  options: QueueSaleOptions
): Promise<OutboxSale> {
  const stockDeltas = await buildStockDeltas(
    options.items,
    options.warehouseId,
    options.stockBehavior
  );

  const input: EnqueueSaleInput = {
    payload: options.payload,
    stockDeltas,
    total: String(options.total),
    customerName: options.customerName,
  };
  return enqueueSale(input);
}
