import { stockService } from '../services';
import type { ItemLotDTO, StockLot } from '../types';

// Lotes por (producto, variante, depósito). Se cachean unos segundos para que
// varias líneas del mismo producto no disparen un pedido cada una.
const cache = new Map<string, { at: number; promise: Promise<StockLot[]> }>();
const TTL_MS = 20_000;

export function fetchLots(productId: string, variantId: string | null | undefined, warehouseId: string): Promise<StockLot[]> {
  const key = `${productId}|${variantId ?? ''}|${warehouseId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = stockService
    .getLots({ productId, warehouseId, ...(variantId ? { variantId } : {}) })
    // Sin variante: solo los lotes del producto base.
    .then((lots) => lots.filter((l) => (l.variantId ?? null) === (variantId ?? null)));
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => cache.delete(key));
  return promise;
}

export const isExpired = (lot: Pick<StockLot, 'daysToExpiry'>) => lot.daysToExpiry !== null && lot.daysToExpiry < 0;

/** Vence antes primero; sin vencimiento después; vencidos al final (igual que el backend). */
export function fefo(lots: StockLot[]): StockLot[] {
  const rank = (l: StockLot) => (l.expiresAt === null ? 1 : isExpired(l) ? 2 : 0);
  return [...lots].sort((a, b) => rank(a) - rank(b) || (a.expiresAt ?? '').localeCompare(b.expiresAt ?? ''));
}

export interface LotPlanLine { lot: StockLot; quantity: number; auto: boolean }

/** Cómo va a salir la cantidad: lo elegido y, para el resto, lo que asignaría el sistema. */
export function planLots(lots: StockLot[], quantity: number, chosen: ItemLotDTO[] | undefined): { lines: LotPlanLine[]; missing: number } {
  const lines: LotPlanLine[] = [];
  const used = new Map<string, number>();
  let left = quantity;
  for (const c of chosen ?? []) {
    const lot = lots.find((l) => l.id === c.lotId);
    if (!lot || left <= 0) continue;
    const q = Math.min(c.quantity, left);
    lines.push({ lot, quantity: q, auto: false });
    used.set(lot.id, (used.get(lot.id) ?? 0) + q);
    left -= q;
  }
  for (const lot of fefo(lots)) {
    if (left <= 0) break;
    const free = lot.quantity - (used.get(lot.id) ?? 0);
    if (free <= 0) continue;
    const q = Math.min(free, left);
    // Si el resto sale del mismo lote elegido, se muestra como una sola línea.
    const same = lines.find((l) => l.lot.id === lot.id);
    if (same) same.quantity += q;
    else lines.push({ lot, quantity: q, auto: true });
    left -= q;
  }
  return { lines, missing: Math.max(0, Math.round(left * 100) / 100) };
}
