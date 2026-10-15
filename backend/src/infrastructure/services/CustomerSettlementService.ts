import { Prisma } from '@prisma/client';
import { container } from 'tsyringe';
import prisma from '../database/prisma';
import { IStockRepository } from '../../domain/repositories/IWarehouseRepository';
import { IReciboRepository } from '../../domain/repositories/IReciboRepository';
import { ICurrentAccountRepository } from '../../domain/repositories/ICurrentAccountRepository';
import { resolveSaleWarehouse } from '../../shared/utils/saleWarehouse';
import { effectiveSaleCondition } from '../../shared/utils/paymentTerms';
import { AppError } from '../../shared/errors/AppError';
import { addCustomerMovement } from './customerAccountMovements';

/**
 * Imputación de cobros a comprobantes de VENTA.
 *
 * Lo que un recibo aplica a su factura no es solo `amount` (la plata):
 *   aplicado = amount + discountAmount (descuento cedido) − interestAmount (recargo)
 * Un recibo de COMPENSACIÓN aplica un crédito existente del cliente sin mover
 * caja ni banco: una NC (`creditInvoiceId`) o un movimiento CREDIT de la cuenta
 * corriente (`creditMovementId`: NC interna o pago a cuenta).
 *
 * Una Nota de Crédito se "consume" por devoluciones (recibos sobre la propia NC)
 * y por compensaciones que la usan. Totalmente consumida pasa a PAID y su
 * mercadería reingresa al stock (una sola vez).
 */

type Client = Prisma.TransactionClient | typeof prisma;

/** Expresión SQL de lo que un recibo aplica a su factura. */
export const RECIBO_APPLIED_SQL = Prisma.sql`(r.amount + COALESCE(r."discountAmount", 0) - COALESCE(r."interestAmount", 0))`;

/** Prefijos de descripción de movimientos generados por el sistema (no son pagos a cuenta). */
const SYSTEM_CREDIT_PREFIXES = [
  'Reversión cheque rechazado:%', 'Anulación nota interna%', 'Reversa por cancelación orden%',
  'Anulación recibo%', 'Cancelled:%', 'Descuento cedido%', 'Anulación %',
];

/** Total aplicado a una factura/ND por sus recibos vigentes. */
export async function invoiceAppliedTotal(invoiceId: string, client: Client = prisma): Promise<number> {
  const [row] = await client.$queryRaw<{ applied: number }[]>`
    SELECT COALESCE(SUM(${RECIBO_APPLIED_SQL}), 0)::float8 AS applied
    FROM "recibos" r WHERE r."invoiceId" = ${invoiceId} AND r.status = 'EMITTED'
  `;
  return Number(row?.applied ?? 0);
}

/** Lo consumido de una NC: devoluciones + compensaciones que la aplican. */
export async function creditNoteConsumed(ncId: string, client: Client = prisma): Promise<number> {
  const [row] = await client.$queryRaw<{ used: number }[]>`
    SELECT COALESCE(SUM(r.amount), 0)::float8 AS used
    FROM "recibos" r
    WHERE r.status = 'EMITTED' AND (r."invoiceId" = ${ncId} OR r."creditInvoiceId" = ${ncId})
  `;
  return Number(row?.used ?? 0);
}

/** Lo consumido de un movimiento CREDIT de la cuenta corriente (NC interna / pago a cuenta). */
export async function creditMovementConsumed(movementId: string, client: Client = prisma): Promise<number> {
  const [row] = await client.$queryRaw<{ used: number }[]>`
    SELECT COALESCE(SUM(r.amount), 0)::float8 AS used
    FROM "recibos" r WHERE r.status = 'EMITTED' AND r."creditMovementId" = ${movementId}
  `;
  return Number(row?.used ?? 0);
}

/** Saldo pendiente de cobro de una factura/ND, o pendiente de consumir de una NC. */
export async function invoicePending(invoice: { id: string; type: string; total: any }, client: Client = prisma): Promise<number> {
  const total = Number(invoice.total);
  const used = invoice.type.startsWith('NOTA_CREDITO')
    ? await creditNoteConsumed(invoice.id, client)
    : await invoiceAppliedTotal(invoice.id, client);
  return Math.round((total - used) * 100) / 100;
}

/**
 * Recalcula el estado de cobro de un comprobante de venta a partir de sus
 * recibos. En una NC además mueve el stock al entrar/salir de PAID.
 */
export async function recalcInvoiceStatus(invoiceId: string, client: Client, userId?: string): Promise<string | null> {
  const inv = await client.invoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
  if (!inv || inv.status === 'CANCELLED' || inv.status === 'DRAFT') return inv?.status ?? null;

  const isNC = inv.type.startsWith('NOTA_CREDITO');
  const total = Number(inv.total);
  const used = isNC ? await creditNoteConsumed(inv.id, client) : await invoiceAppliedTotal(inv.id, client);
  const unpaid = (inv as any).cae ? 'AUTHORIZED' : 'ISSUED';
  const next = used >= total - 0.005 ? 'PAID' : (!isNC && used > 0.005 ? 'PARTIALLY_PAID' : unpaid);

  if (next !== inv.status) {
    await client.invoice.update({ where: { id: inv.id }, data: { status: next as any } });
  }

  // NC: la mercadería vuelve al depósito cuando la nota queda totalmente
  // consumida (devuelta o aplicada a facturas), y sale de nuevo si deja de estarlo.
  if (isNC && (next === 'PAID') !== (inv.status === 'PAID')) {
    const wh = await resolveSaleWarehouse('invoices', (inv as any).originInvoiceId ?? inv.id, (inv as any).companyId);
    if (wh) {
      const stockRepo = container.resolve<IStockRepository>('StockRepository');
      const entering = next === 'PAID';
      for (const item of inv.items) {
        if (!item.productId) continue;
        await stockRepo.addMovement({
          productId: item.productId,
          variantId: (item as any).variantId ?? null,
          warehouseId: wh.id,
          type: entering ? 'RETURN' : 'ADJUSTMENT_OUT',
          quantity: Number(item.quantity),
          reason: entering ? `Devolución NC ${inv.number}` : `Anulación devolución NC ${inv.number}`,
          referenceId: inv.id,
          userId: userId ?? inv.userId,
        }, client as Prisma.TransactionClient);
      }
    }
  }
  return next;
}

// ── Créditos disponibles del cliente ─────────────────────────────────────────

export interface CustomerCredit {
  source: 'INVOICE' | 'MOVEMENT';
  creditInvoiceId?: string;
  creditMovementId?: string;
  number: string;
  description: string;
  date: Date;
  currency: string;
  /** El crédito vive en la cuenta corriente (genera/consume saldo ahí). */
  inCurrentAccount: boolean;
  amount: number;
  used: number;
  balance: number;
}

/**
 * Saldo a favor del cliente que se puede aplicar a facturas: NC con remanente,
 * NC internas activas y pagos a cuenta (recibos sin comprobante, o movimientos
 * sueltos anteriores a que el pago a cuenta generara recibo).
 */
export async function getCustomerCredits(
  customerId: string,
  opts: { companyId?: string; currency?: string; fiscalMode?: string; client?: Client } = {}
): Promise<CustomerCredit[]> {
  const client = opts.client ?? prisma;
  const cur = opts.currency ?? null;
  const fm = opts.fiscalMode ?? null;

  const ncRows = await client.$queryRaw<any[]>`
    SELECT i.id, i.number, i.date, i.currency::text AS currency, i.total::float8 AS amount,
           i."saleCondition", i."paymentTerms",
           COALESCE((
             SELECT SUM(r.amount) FROM "recibos" r
             WHERE r.status = 'EMITTED' AND (r."invoiceId" = i.id OR r."creditInvoiceId" = i.id)
           ), 0)::float8 AS used
    FROM "invoices" i
    WHERE i."customerId" = ${customerId}
      AND (${opts.companyId ?? null}::text IS NULL OR i."companyId" = ${opts.companyId ?? null})
      AND i.type::text LIKE 'NOTA_CREDITO%'
      AND i.status::text NOT IN ('DRAFT', 'CANCELLED', 'PAID')
      AND (${cur}::text IS NULL OR i.currency::text = ${cur})
      AND (${fm}::text IS NULL OR i."fiscalMode" = ${fm})
    ORDER BY i.date ASC
  `;

  const notSystem = Prisma.join(SYSTEM_CREDIT_PREFIXES.map((p) => Prisma.sql`m.description NOT LIKE ${p}`), ' AND ');
  const movRows = await client.$queryRaw<any[]>`
    SELECT m.id, m.description, m."createdAt" AS date, ca.currency::text AS currency, m.amount::float8 AS amount,
           n.number AS "noteNumber", r.number AS "reciboNumber",
           COALESCE((
             SELECT SUM(rc.amount) FROM "recibos" rc WHERE rc.status = 'EMITTED' AND rc."creditMovementId" = m.id
           ), 0)::float8 AS used
    FROM "account_movements" m
    JOIN "current_accounts" ca ON ca.id = m."currentAccountId"
    LEFT JOIN "internal_notes" n ON n.id = m."internalNoteId"
    LEFT JOIN "recibos" r ON r.id = m."reciboId"
    WHERE ca."customerId" = ${customerId}
      AND m.type = 'CREDIT'
      AND (${cur}::text IS NULL OR ca.currency::text = ${cur})
      AND (${fm}::text IS NULL OR m."fiscalMode" = ${fm})
      AND m."sourceReciboId" IS NULL
      AND (
        -- NC interna activa
        (n.id IS NOT NULL AND n.type = 'CREDIT' AND n.status = 'ACTIVE')
        -- pago a cuenta con recibo
        OR (r.id IS NOT NULL AND r.status = 'EMITTED' AND r."invoiceId" IS NULL AND r."budgetId" IS NULL
            AND r."ordenPedidoId" IS NULL AND r."paymentMethod" <> 'COMPENSACION')
        -- pago a cuenta anterior (movimiento suelto)
        OR (m."internalNoteId" IS NULL AND m."reciboId" IS NULL AND m."invoiceId" IS NULL
            AND m."ordenPedidoId" IS NULL AND m."budgetId" IS NULL AND ${notSystem})
      )
    ORDER BY m."createdAt" ASC
  `;

  const round = (n: number) => Math.round(n * 100) / 100;
  const credits: CustomerCredit[] = [
    ...ncRows.map((r) => ({
      source: 'INVOICE' as const, creditInvoiceId: r.id, number: r.number, description: `Nota de crédito ${r.number}`,
      date: r.date, currency: r.currency,
      inCurrentAccount: effectiveSaleCondition(r.saleCondition, r.paymentTerms) === 'CUENTA_CORRIENTE',
      amount: Number(r.amount), used: Number(r.used), balance: round(Number(r.amount) - Number(r.used)),
    })),
    ...movRows.map((r) => ({
      source: 'MOVEMENT' as const, creditMovementId: r.id,
      number: r.noteNumber ?? r.reciboNumber ?? 'Pago a cuenta',
      description: r.description, date: r.date, currency: r.currency, inCurrentAccount: true,
      amount: Number(r.amount), used: Number(r.used), balance: round(Number(r.amount) - Number(r.used)),
    })),
  ];
  return credits.filter((c) => c.balance > 0.005);
}

/** Busca un crédito puntual del cliente y valida que alcance para `amount`. */
export async function requireCustomerCredit(
  customerId: string,
  ref: { creditInvoiceId?: string | null; creditMovementId?: string | null },
  amount: number,
  opts: { companyId?: string; currency?: string; client?: Client }
): Promise<CustomerCredit> {
  const credits = await getCustomerCredits(customerId, opts);
  const found = credits.find((c) =>
    ref.creditInvoiceId ? c.creditInvoiceId === ref.creditInvoiceId : c.creditMovementId === ref.creditMovementId
  );
  if (!found) throw new AppError('El saldo a favor elegido no está disponible para este cliente', 400);
  if (amount > found.balance + 0.005) {
    throw new AppError(`El monto supera el saldo disponible de ${found.number} (${found.balance.toFixed(2)})`, 400);
  }
  return found;
}

/**
 * Aplica una NC a su factura de origen al emitirse: genera un recibo de
 * compensación por lo que la factura todavía tenía pendiente. Si la factura ya
 * estaba cobrada, la NC queda con saldo para devolver o aplicar a otra factura.
 */
export async function applyCreditNoteToOrigin(
  nc: { id: string; number: string; type: string; total: any; currency: string; customerId: string; originInvoiceId?: string | null; fiscalMode?: string | null },
  ctx: { userId: string; companyId: string },
  tx: Prisma.TransactionClient
): Promise<void> {
  if (!nc.type.startsWith('NOTA_CREDITO') || !nc.originInvoiceId) return;
  const origin = await tx.invoice.findUnique({ where: { id: nc.originInvoiceId } });
  if (!origin || ['DRAFT', 'CANCELLED', 'PAID'].includes(origin.status)) return;
  if (origin.currency !== nc.currency || origin.customerId !== nc.customerId) return;

  const pending = await invoicePending(origin, tx);
  const available = Number(nc.total) - await creditNoteConsumed(nc.id, tx);
  const amount = Math.round(Math.min(pending, available) * 100) / 100;
  if (amount <= 0.005) return;

  // Si una vive en cuenta corriente y la otra no, el saldo tiene que acompañar.
  const originCC = effectiveSaleCondition((origin as any).saleCondition, (origin as any).paymentTerms) === 'CUENTA_CORRIENTE';
  const ncCC = effectiveSaleCondition((nc as any).saleCondition, (nc as any).paymentTerms) === 'CUENTA_CORRIENTE';

  await createCompensationRecibo({
    invoice: origin as any,
    amount,
    creditInvoiceId: nc.id,
    sourceInCurrentAccount: ncCC,
    invoiceInCurrentAccount: originCC,
    notes: `Aplicación automática de ${nc.number}`,
    userId: ctx.userId,
    companyId: ctx.companyId,
  }, tx);
  await recalcInvoiceStatus(nc.id, tx, ctx.userId);
}

/**
 * Recibo de compensación: aplica un crédito del cliente a una factura. No mueve
 * caja ni banco. Solo toca la cuenta corriente cuando el crédito y la factura
 * no están los dos en ella (p.ej. NC interna aplicada a una factura de contado).
 */
export async function createCompensationRecibo(
  p: {
    invoice: { id: string; number: string; type: string; customerId: string; currency: string; fiscalMode?: string | null };
    amount: number;
    creditInvoiceId?: string | null;
    creditMovementId?: string | null;
    sourceInCurrentAccount: boolean;
    invoiceInCurrentAccount: boolean;
    notes?: string | null;
    userId: string;
    companyId: string;
  },
  tx: Prisma.TransactionClient
): Promise<any> {
  const reciboRepo = container.resolve<IReciboRepository>('ReciboRepository');
  const fiscalMode = (p.invoice.fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL';
  const recibo = await reciboRepo.create({
    invoiceId: p.invoice.id,
    customerId: p.invoice.customerId,
    userId: p.userId,
    cashRegisterId: null,
    amount: p.amount,
    currency: p.invoice.currency,
    paymentMethod: 'COMPENSACION',
    notes: p.notes ?? null,
    companyId: p.companyId,
    fiscalMode,
  } as any, tx);
  await tx.$executeRaw`
    UPDATE "recibos" SET "creditInvoiceId" = ${p.creditInvoiceId ?? null}, "creditMovementId" = ${p.creditMovementId ?? null}
    WHERE id = ${recibo.id}
  `;

  if (p.sourceInCurrentAccount !== p.invoiceInCurrentAccount) {
    await addCustomerMovement({
      customerId: p.invoice.customerId,
      currency: p.invoice.currency,
      fiscalMode,
      // Factura en CC + crédito afuera → baja la deuda. Factura afuera + crédito
      // en CC → el crédito se consume.
      type: p.invoiceInCurrentAccount ? 'CREDIT' : 'DEBIT',
      amount: p.amount,
      description: `Compensación ${recibo.number} - ${p.invoice.type} ${p.invoice.number}`,
      invoiceId: p.invoice.id,
      reciboId: recibo.id,
    }, tx);
  }

  await recalcInvoiceStatus(p.invoice.id, tx, p.userId);
  return recibo;
}

/**
 * Anula un recibo de compensación (o cualquiera cuyo movimiento de cuenta
 * corriente se revierta igual): revierte sus movimientos y lo marca CANCELLED.
 * No recalcula estados: lo hace el llamador.
 */
export async function reverseReciboMovements(recibo: { id: string; number: string }, tx: Prisma.TransactionClient): Promise<void> {
  const caRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
  // Movimiento principal (reciboId) + accesorios (descuento cedido / recargo).
  const movements = await tx.$queryRaw<{ id: string; currentAccountId: string; type: string; amount: any; invoiceId: string | null; cashRegisterId: string | null }[]>`
    SELECT id, "currentAccountId", type::text AS type, amount, "invoiceId", "cashRegisterId"
    FROM "account_movements" WHERE "reciboId" = ${recibo.id} OR "sourceReciboId" = ${recibo.id}
  `;
  for (const m of movements) {
    await caRepo.addMovement({
      currentAccountId: m.currentAccountId,
      type: m.type === 'CREDIT' ? 'DEBIT' : 'CREDIT',
      amount: Number(m.amount),
      description: `Anulación recibo ${recibo.number}`,
      invoiceId: m.invoiceId ?? undefined,
      cashRegisterId: m.cashRegisterId ?? undefined,
    }, tx);
  }
}

/** Al anular una NC se deshacen las compensaciones que la aplicaban a facturas. */
export async function cancelCompensationsFromCreditNote(ncId: string, tx: Prisma.TransactionClient, userId?: string): Promise<void> {
  const comps = await tx.$queryRaw<{ id: string; number: string; invoiceId: string | null }[]>`
    SELECT id, number, "invoiceId" FROM "recibos" WHERE "creditInvoiceId" = ${ncId} AND status = 'EMITTED'
  `;
  for (const r of comps) {
    await reverseReciboMovements(r, tx);
    await tx.$executeRaw`UPDATE "recibos" SET status = 'CANCELLED', "updatedAt" = NOW() WHERE id = ${r.id}`;
    if (r.invoiceId) await recalcInvoiceStatus(r.invoiceId, tx, userId);
  }
  if (comps.length > 0) await recalcInvoiceStatus(ncId, tx, userId);
}
