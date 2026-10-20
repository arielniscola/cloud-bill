import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { columnExists } from './columnExists';

// Detalle libre de una línea (servicios / productos no inventariados). La
// columna llega con la migración 20261019120000_item_detail: mientras no se
// aplique se lee null y se saltea la escritura. Va por SQL crudo porque el
// cliente Prisma puede estar desactualizado.
export type ItemDetailTable = 'invoice_items' | 'budget_items' | 'orden_pedido_items';

type Client = Prisma.TransactionClient | typeof prisma;

function tableSql(table: ItemDetailTable): Prisma.Sql {
  if (table === 'invoice_items') return Prisma.sql`"invoice_items"`;
  if (table === 'budget_items') return Prisma.sql`"budget_items"`;
  return Prisma.sql`"orden_pedido_items"`;
}

/** '' / espacios → null; el resto se guarda recortado. */
export function normalizeItemDetail(detail: unknown): string | null {
  if (typeof detail !== 'string') return null;
  const trimmed = detail.trim();
  return trimmed ? trimmed : null;
}

export async function saveItemDetail(
  table: ItemDetailTable,
  itemId: string,
  detail: unknown,
  client: Client = prisma
): Promise<void> {
  const value = normalizeItemDetail(detail);
  if (!value || !(await columnExists(table, 'detail'))) return;
  await client.$executeRaw`UPDATE ${tableSql(table)} SET "detail" = ${value} WHERE id = ${itemId}`;
}

/** Completa `item.detail` (null si no tiene o la migración no corrió). */
export async function attachItemDetails<T extends { id: string }>(
  table: ItemDetailTable,
  items: T[]
): Promise<Array<T & { detail: string | null }>> {
  const out = items as Array<T & { detail: string | null }>;
  for (const item of out) item.detail = item.detail ?? null;
  if (out.length === 0 || !(await columnExists(table, 'detail'))) return out;
  const rows = await prisma.$queryRaw<{ id: string; detail: string | null }[]>`
    SELECT id, "detail" FROM ${tableSql(table)} WHERE id = ANY(${out.map((i) => i.id)}::text[])
  `;
  const map = new Map(rows.map((r) => [r.id, r.detail]));
  for (const item of out) item.detail = map.get(item.id) ?? null;
  return out;
}
