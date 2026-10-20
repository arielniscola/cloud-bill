import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import type { LotSpec } from '../../infrastructure/database/repositories/stockLots';

// Lotes elegidos en un comprobante (remito, factura, orden de pedido) desde que
// se carga hasta que el stock se mueve (al crear, al emitir o al entregar).
// Se guardan en la columna jsonb `lotSelections` del encabezado, agregados por
// producto + variante: los movimientos de stock se hacen por línea y van
// tomando de ese pozo. Por SQL crudo (cliente Prisma posiblemente desactualizado).

type Client = Prisma.TransactionClient | PrismaClient;
export type LotTable = 'invoices' | 'remitos' | 'orden_pedidos';

export interface LotSelection {
  productId: string;
  variantId: string | null;
  lots: { lotId: string; quantity: number }[];
}

type ItemWithLots = {
  productId?: string | null;
  variantId?: string | null;
  lots?: { lotId: string; quantity: number }[] | null;
};

/** Junta los lotes que trae cada línea, por producto + variante. */
export function selectionsFromItems(items: ItemWithLots[]): LotSelection[] {
  const map = new Map<string, LotSelection>();
  for (const it of items) {
    if (!it.productId || !it.lots?.length) continue;
    const key = `${it.productId}|${it.variantId ?? ''}`;
    const sel = map.get(key) ?? { productId: it.productId, variantId: it.variantId ?? null, lots: [] };
    for (const l of it.lots) {
      if (!(Number(l.quantity) > 0)) continue;
      const prev = sel.lots.find((x) => x.lotId === l.lotId);
      if (prev) prev.quantity += Number(l.quantity);
      else sel.lots.push({ lotId: l.lotId, quantity: Number(l.quantity) });
    }
    if (sel.lots.length) map.set(key, sel);
  }
  return [...map.values()];
}

/** Las líneas sin `lots`, para pasárselas a los repositorios (que no conocen el campo). */
export function stripItemLots<T extends object>(items: T[]): T[] {
  return items.map((it) => {
    const { lots: _lots, ...rest } = it as T & { lots?: unknown };
    return rest as T;
  });
}

export async function saveLotSelections(table: LotTable, id: string, selections: LotSelection[], client: Client = prisma): Promise<void> {
  const value = selections.length ? JSON.stringify(selections) : null;
  const tableSql = Prisma.raw(`"${table}"`);
  await client.$executeRaw`UPDATE ${tableSql} SET "lotSelections" = ${value}::jsonb WHERE id = ${id}`;
}

export async function loadLotSelections(table: LotTable, id: string, client: Client = prisma): Promise<LotSelection[]> {
  const tableSql = Prisma.raw(`"${table}"`);
  const rows = await client.$queryRaw<{ lotSelections: LotSelection[] | null }[]>`
    SELECT "lotSelections" FROM ${tableSql} WHERE id = ${id} LIMIT 1
  `;
  return Array.isArray(rows[0]?.lotSelections) ? rows[0]!.lotSelections! : [];
}

/** Pozo de lotes elegidos: cada movimiento de una línea toma lo suyo; lo que falte lo reparte el stock (FEFO). */
export class LotPool {
  private pool: Map<string, { lotId: string; quantity: number }[]>;

  constructor(selections: LotSelection[]) {
    this.pool = new Map(selections.map((s) => [`${s.productId}|${s.variantId ?? ''}`, s.lots.map((l) => ({ ...l }))]));
  }

  take(productId: string, variantId: string | null | undefined, quantity: number): LotSpec[] | undefined {
    const lots = this.pool.get(`${productId}|${variantId ?? ''}`);
    if (!lots?.length) return undefined;
    const out: LotSpec[] = [];
    let left = quantity;
    for (const l of lots) {
      if (left <= 0) break;
      const q = Math.min(l.quantity, left);
      if (q <= 0) continue;
      out.push({ lotId: l.lotId, quantity: q });
      l.quantity -= q;
      left -= q;
    }
    return out.length ? out : undefined;
  }
}
