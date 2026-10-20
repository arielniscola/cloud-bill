import { Prisma } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import { AppError } from '../errors/AppError';

/**
 * Facturación de remitos: varios remitos LIBRES (sin factura/presupuesto/OP de
 * origen) del mismo cliente se facturan juntos. `remitos.billedInvoiceId`
 * apunta a la factura (migración 20261017130000_remito_billed_invoice).
 *
 * El remito libre ya descontó el stock al crearse, así que la factura que lo
 * factura NO mueve stock ni genera remito automático, y sus cantidades tienen
 * que coincidir exactamente con las de los remitos (se corrige con otro remito
 * o una nota de crédito, nunca editando la factura).
 *
 * Todo va por SQL crudo: el cliente Prisma puede no conocer la columna.
 */

let columnExists: boolean | null = null;

export async function hasBilledColumn(): Promise<boolean> {
  if (columnExists !== null) return columnExists;
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'remitos' AND column_name = 'billedInvoiceId'
    ) AS "exists"
  `;
  columnExists = rows[0]?.exists ?? false;
  return columnExists;
}

export interface BilledRemitoRef {
  id: string;
  number: string;
  date: Date;
  status: string;
}

/** Remitos facturados por una factura. */
export async function findBilledRemitos(invoiceId: string): Promise<BilledRemitoRef[]> {
  if (!(await hasBilledColumn())) return [];
  return prisma.$queryRaw<BilledRemitoRef[]>`
    SELECT id, number, date, status::text AS status FROM "remitos"
    WHERE "billedInvoiceId" = ${invoiceId}
    ORDER BY date ASC, number ASC
  `;
}

export async function hasBilledRemitos(invoiceId: string): Promise<boolean> {
  return (await findBilledRemitos(invoiceId)).length > 0;
}

export interface RemitoBilledInvoiceRef {
  id: string;
  number: string;
  type: string;
  status: string;
}

/** Factura vigente (no anulada) que facturó cada remito. */
export async function findBilledInvoicesFor(remitoIds: string[]): Promise<Record<string, RemitoBilledInvoiceRef>> {
  if (remitoIds.length === 0 || !(await hasBilledColumn())) return {};
  const rows = await prisma.$queryRaw<(RemitoBilledInvoiceRef & { remitoId: string })[]>`
    SELECT r.id AS "remitoId", i.id, i.number, i.type::text AS type, i.status::text AS status
    FROM "remitos" r
    JOIN "invoices" i ON i.id = r."billedInvoiceId" AND i.status::text <> 'CANCELLED'
    WHERE r.id IN (${Prisma.join(remitoIds)})
  `;
  return Object.fromEntries(rows.map(({ remitoId, ...inv }) => [remitoId, inv]));
}

/** IDs de remitos libres, vigentes y sin facturar de un cliente. */
export async function findUnbilledRemitoIds(companyId: string, customerId: string): Promise<string[]> {
  if (!(await hasBilledColumn())) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT r.id FROM "remitos" r
    LEFT JOIN "invoices" i ON i.id = r."billedInvoiceId"
    WHERE r."companyId" = ${companyId}
      AND r."customerId" = ${customerId}
      AND r."invoiceId" IS NULL AND r."budgetId" IS NULL AND r."ordenPedidoId" IS NULL
      AND r.status::text <> 'CANCELLED'
      AND (r."billedInvoiceId" IS NULL OR i.status::text = 'CANCELLED')
    ORDER BY r.date ASC, r.number ASC
  `;
  return rows.map((r) => r.id);
}

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * Verifica que los remitos se puedan facturar en la factura `invoiceId`
 * (o en una nueva si es null). Con `tx` los bloquea FOR UPDATE para que dos
 * facturas no tomen el mismo remito a la vez.
 */
export async function assertRemitosBillable(
  remitoIds: string[],
  opts: { companyId: string; customerId: string; invoiceId?: string | null },
  tx?: Prisma.TransactionClient
): Promise<void> {
  if (!(await hasBilledColumn())) {
    throw new AppError('La facturación de remitos requiere aplicar la migración 20261017130000_remito_billed_invoice', 400);
  }
  const ids = [...new Set(remitoIds)];
  const client: Client = tx ?? prisma;
  const rows = await client.$queryRaw<{
    id: string; number: string; companyId: string; customerId: string; status: string;
    invoiceId: string | null; budgetId: string | null; ordenPedidoId: string | null;
    billedInvoiceId: string | null;
  }[]>(Prisma.sql`
    SELECT id, number, "companyId", "customerId", status::text AS status,
           "invoiceId", "budgetId", "ordenPedidoId", "billedInvoiceId"
    FROM "remitos" WHERE id IN (${Prisma.join(ids)})
    ${tx ? Prisma.sql`FOR UPDATE` : Prisma.empty}
  `);
  const found = rows.filter((r) => r.companyId === opts.companyId);
  if (found.length !== ids.length) throw new AppError('Uno o más remitos no existen', 404);

  const billedIds = [...new Set(found.map((r) => r.billedInvoiceId).filter((v): v is string => !!v))];
  const liveBilled = new Set(
    billedIds.length === 0 ? [] : (await client.$queryRaw<{ id: string }[]>`
      SELECT id FROM "invoices" WHERE id IN (${Prisma.join(billedIds)}) AND status::text <> 'CANCELLED'
    `).map((r) => r.id)
  );

  for (const r of found) {
    if (r.invoiceId || r.budgetId || r.ordenPedidoId) {
      throw new AppError(`El remito ${r.number} salió de otro comprobante: ya está facturado por su origen`, 400);
    }
    if (r.status === 'CANCELLED') throw new AppError(`El remito ${r.number} está anulado`, 400);
    if (r.customerId !== opts.customerId) {
      throw new AppError('Todos los remitos tienen que ser del mismo cliente que la factura', 400);
    }
    if (r.billedInvoiceId && r.billedInvoiceId !== opts.invoiceId && liveBilled.has(r.billedInvoiceId)) {
      throw new AppError(`El remito ${r.number} ya está facturado`, 400);
    }
  }
}

const keyOf = (productId: string, variantId: string | null | undefined) => `${productId}|${variantId ?? ''}`;

/**
 * Las cantidades de la factura tienen que ser exactamente las de los remitos
 * (sumadas por producto y variante): el stock ya lo movieron los remitos.
 */
export async function assertItemsMatchRemitos(
  items: { productId: string; variantId?: string | null; quantity: number | string }[],
  remitoIds: string[]
): Promise<void> {
  const remitoItems = await prisma.$queryRaw<{ productId: string; variantId: string | null; quantity: number; name: string }[]>`
    SELECT ri."productId", ri."variantId", SUM(ri.quantity)::float8 AS quantity, p.name
    FROM "remito_items" ri JOIN "products" p ON p.id = ri."productId"
    WHERE ri."remitoId" IN (${Prisma.join([...new Set(remitoIds)])})
    GROUP BY ri."productId", ri."variantId", p.name
  `;
  const expected = new Map(remitoItems.map((r) => [keyOf(r.productId, r.variantId), r]));
  const invoiced = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item.productId, item.variantId);
    invoiced.set(key, (invoiced.get(key) ?? 0) + Number(item.quantity));
  }
  for (const [key, qty] of invoiced) {
    const exp = expected.get(key);
    if (!exp) throw new AppError('La factura tiene productos que no están en los remitos facturados', 400);
    if (Math.abs(exp.quantity - qty) > 0.0001) {
      throw new AppError(`La cantidad de "${exp.name}" tiene que ser la de los remitos (${exp.quantity})`, 400);
    }
  }
  for (const [key, exp] of expected) {
    if (!invoiced.has(key)) throw new AppError(`Falta facturar "${exp.name}" de los remitos`, 400);
  }
}

export async function linkRemitosToInvoice(invoiceId: string, remitoIds: string[], tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`
    UPDATE "remitos" SET "billedInvoiceId" = ${invoiceId}, "updatedAt" = NOW()
    WHERE id IN (${Prisma.join([...new Set(remitoIds)])})
  `;
}

/** Libera los remitos de una factura anulada: vuelven a quedar para facturar. */
export async function unlinkRemitosFromInvoice(invoiceId: string, tx?: Prisma.TransactionClient): Promise<void> {
  if (!(await hasBilledColumn())) return;
  await (tx ?? prisma).$executeRaw`
    UPDATE "remitos" SET "billedInvoiceId" = NULL, "updatedAt" = NOW()
    WHERE "billedInvoiceId" = ${invoiceId}
  `;
}

/**
 * Cantidades entregadas por remitos facturados, para el estado de entrega de
 * la factura: sus remitos de origen ya entregaron la mercadería.
 */
export async function billedDeliveredRows(invoiceIds: string[]): Promise<{ invoiceId: string; productId: string; delivered: number }[]> {
  if (invoiceIds.length === 0 || !(await hasBilledColumn())) return [];
  return prisma.$queryRaw<{ invoiceId: string; productId: string; delivered: number }[]>`
    SELECT r."billedInvoiceId" AS "invoiceId", ri."productId", SUM(ri."deliveredQuantity")::float8 AS delivered
    FROM "remito_items" ri JOIN "remitos" r ON r.id = ri."remitoId"
    WHERE r."billedInvoiceId" IN (${Prisma.join(invoiceIds)}) AND r.status::text <> 'CANCELLED'
    GROUP BY r."billedInvoiceId", ri."productId"
  `;
}
