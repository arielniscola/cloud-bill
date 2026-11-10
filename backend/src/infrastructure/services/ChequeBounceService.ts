import { randomUUID } from 'crypto';
import { container } from 'tsyringe';
import { ICurrentAccountRepository } from '../../domain/repositories/ICurrentAccountRepository';
import { IOrdenPagoRepository } from '../../domain/repositories/IOrdenPagoRepository';
import { IInvoiceRepository } from '../../domain/repositories/IInvoiceRepository';
import { IAppSettingsRepository } from '../../domain/repositories/IAppSettingsRepository';
import { Currency } from '../../shared/types';
import { AppError } from '../../shared/errors/AppError';
import { IInternalNoteRepository } from '../../domain/repositories/IInternalNoteRepository';
import { createInternalNote, cancelInternalNote } from './InternalNoteService';
import { leaveDraftIfNeeded } from '../http/controllers/InvoiceController';
import prisma from '../database/prisma';

/**
 * Cómo se documenta el débito del rechazo (lo elige el usuario):
 *  - INTERNAL_NOTE: nota de débito interna (no fiscal) — comportamiento histórico.
 *  - DEBIT_NOTE:    cliente → Nota de Débito de venta (A/B/C) creada y EMITIDA,
 *                   sin enviar a ARCA (se puede autorizar después desde la factura).
 *                   proveedor → Nota de Débito de compra cargada con el número que
 *                   mandó el proveedor.
 */
export type ChequeBounceMode = 'INTERNAL_NOTE' | 'DEBIT_NOTE';

export interface ChequeBounceOptions {
  mode?: ChequeBounceMode;
  /** Solo proveedor + DEBIT_NOTE: número de la ND que emitió el proveedor. */
  debitNoteNumber?: string | null;
  /** Solo proveedor + DEBIT_NOTE: letra del comprobante (A/B/C). */
  debitNoteLetter?: 'A' | 'B' | 'C' | null;
}

interface ChequeBounceParams extends ChequeBounceOptions {
  customerId?: string | null;
  supplierId?: string | null;
  amount: number;
  currency?: string | null;
  exchangeRate?: number | null;
  reference: string;                 // N° de cheque (o número interno)
  direction: 'DEBIT' | 'CREDIT';     // DEBIT al rechazar, CREDIT al revertir
  companyId: string;
  fiscalMode?: string;
  userId: string;
}

export interface ChequeBounceResult {
  kind: 'INTERNAL_NOTE' | 'SALES_DEBIT_NOTE' | 'PURCHASE_DEBIT_NOTE' | 'REVERSED' | 'NONE';
  id?: string;
  number?: string;
}

const bounceReason = (reference: string) => `Cheque rechazado: ${reference}`;

/**
 * Valida las opciones ANTES de tocar el estado del cheque, para que un dato
 * faltante no deje el cheque rechazado sin su débito.
 */
export function assertBounceOptions(p: { customerId?: string | null; supplierId?: string | null } & ChequeBounceOptions): void {
  if (p.mode !== 'DEBIT_NOTE') return;
  if (!p.customerId && !p.supplierId) {
    throw new AppError('El cheque no tiene cliente ni proveedor asociado: no se puede generar una Nota de Débito', 400);
  }
  if (!p.customerId && p.supplierId && !p.debitNoteNumber?.trim()) {
    throw new AppError('Indicá el número de la Nota de Débito del proveedor', 400);
  }
}

/**
 * Genera el débito en la cuenta corriente de la parte que corresponda cuando un
 * cheque se marca como rechazado, y lo revierte si vuelve atrás.
 *  - Venta  (cliente):  DEBIT sube la deuda del cliente (no nos pagó).
 *  - Compra (proveedor): DEBIT sube lo que le debemos (nuestro cheque rebotó).
 * Si el cheque no tiene cliente ni proveedor asociado, no hace nada.
 *
 * La reversión de una Nota de Débito fiscal NO es automática: se exige anularla
 * (venta) o eliminarla (compra) antes de volver el cheque a cartera.
 */
export async function recordChequeBounceMovement(p: ChequeBounceParams): Promise<ChequeBounceResult> {
  if (p.amount <= 0) return { kind: 'NONE' };
  if (!p.customerId && !p.supplierId) return { kind: 'NONE' };
  const reason = bounceReason(p.reference);
  const currency = p.currency || 'ARS';
  const customerId = p.customerId ?? null;
  const supplierId = customerId ? null : p.supplierId ?? null;

  if (p.direction === 'DEBIT') {
    assertBounceOptions(p);
    if (p.mode === 'DEBIT_NOTE') {
      return customerId
        ? createSalesDebitNote({ ...p, customerId, currency, reason })
        : createPurchaseDebitNote({ ...p, supplierId: supplierId!, currency, reason });
    }
    const note = await createInternalNote({
      type: 'DEBIT',
      customerId,
      supplierId,
      userId: p.userId,
      companyId: p.companyId,
      currency,
      amount: p.amount,
      reason,
      fiscalMode: p.fiscalMode,
    });
    return { kind: 'INTERNAL_NOTE', id: note.id, number: note.number };
  }

  // ── Reversión ─────────────────────────────────────────────────────────────
  // 1) ND interna activa del rechazo (la última) → se anula.
  const [note] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "internal_notes"
    WHERE "companyId" = ${p.companyId} AND type = 'DEBIT' AND status = 'ACTIVE' AND reason = ${reason}
      AND (${customerId}::text IS NULL OR "customerId" = ${customerId})
      AND (${supplierId}::text IS NULL OR "supplierId" = ${supplierId})
    ORDER BY "createdAt" DESC LIMIT 1
  `;
  if (note) {
    const repo = container.resolve<IInternalNoteRepository>('InternalNoteRepository');
    const full = await repo.findById(note.id);
    if (full) { await cancelInternalNote(full); return { kind: 'REVERSED', id: full.id }; }
  }

  // 2) Nota de Débito fiscal vigente → la tiene que anular el usuario.
  if (customerId) {
    const [nd] = await prisma.$queryRaw<{ id: string; number: string; status: string }[]>`
      SELECT id, number, status::text AS status FROM "invoices"
      WHERE "companyId" = ${p.companyId} AND "customerId" = ${customerId}
        AND type::text LIKE 'NOTA_DEBITO%' AND notes = ${reason}
      ORDER BY "createdAt" DESC LIMIT 1
    `;
    if (nd) {
      if (nd.status !== 'CANCELLED') {
        throw new AppError(
          `El rechazo generó la Nota de Débito ${nd.number}. Anulala antes de volver el cheque a cartera.`,
          400
        );
      }
      return { kind: 'NONE' }; // la anulación de la ND ya revirtió la cuenta corriente
    }
  } else {
    const [nd] = await prisma.$queryRaw<{ id: string; number: string }[]>`
      SELECT id, number FROM "purchase_invoices"
      WHERE "companyId" = ${p.companyId} AND "supplierId" = ${supplierId}
        AND type LIKE 'NOTA_DEBITO%' AND notes = ${reason}
      ORDER BY "createdAt" DESC LIMIT 1
    `;
    if (nd) {
      throw new AppError(
        `El rechazo generó la Nota de Débito de compra ${nd.number}. Eliminala antes de volver el cheque a cartera.`,
        400
      );
    }
  }

  // 3) Rechazos anteriores a las notas internas: el débito era un movimiento
  //    suelto. Solo se revierte si queda alguno sin revertir (evita acreditar
  //    de más cuando el débito ya se anuló por otra vía).
  const desc = `Reversión cheque rechazado: ${p.reference}`;
  if (customerId) {
    const [r] = await prisma.$queryRaw<{ pending: bigint }[]>`
      SELECT (COUNT(*) FILTER (WHERE m.description = ${reason} AND m.type = 'DEBIT')
            - COUNT(*) FILTER (WHERE m.description = ${desc} AND m.type = 'CREDIT')) AS pending
      FROM "account_movements" m
      JOIN "current_accounts" ca ON ca.id = m."currentAccountId"
      WHERE ca."customerId" = ${customerId}
    `;
    if (Number(r?.pending ?? 0) <= 0) return { kind: 'NONE' };
    const caRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
    let account = await caRepo.findByCustomerId(customerId, currency as Currency, p.fiscalMode);
    if (!account) account = await caRepo.createForCustomer(customerId, currency as Currency, undefined, p.fiscalMode);
    await caRepo.addMovement({ currentAccountId: account.id, type: 'CREDIT', amount: p.amount, description: desc });
    return { kind: 'REVERSED' };
  }

  const [r] = await prisma.$queryRaw<{ pending: bigint }[]>`
    SELECT (COUNT(*) FILTER (WHERE description = ${reason} AND type = 'DEBIT')
          - COUNT(*) FILTER (WHERE description = ${desc} AND type = 'CREDIT')) AS pending
    FROM "supplier_account_movements"
    WHERE "supplierId" = ${supplierId} AND "companyId" = ${p.companyId}
  `;
  if (Number(r?.pending ?? 0) <= 0) return { kind: 'NONE' };
  const opRepo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
  await opRepo.createSupplierMovement({
    supplierId: supplierId!,
    type: 'CREDIT',
    amount: p.amount,
    currency,
    description: desc,
    companyId: p.companyId,
    fiscalMode: (p.fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL',
  });
  return { kind: 'REVERSED' };
}

// ── Nota de Débito de venta ─────────────────────────────────────────────────

export const CHEQUE_BOUNCE_PRODUCT_SKU = 'CHEQUE-RECHAZADO';

/**
 * Producto genérico (no inventariado, inactivo para no ensuciar el catálogo)
 * que usa la ND por cheque rechazado: `invoice_items.productId` es obligatorio.
 * Se crea la primera vez, bajo advisory lock para no duplicarlo.
 */
async function resolveChequeBounceProductId(companyId: string): Promise<string> {
  const find = async (db: typeof prisma | any) => {
    const [row] = await db.$queryRaw`
      SELECT id FROM "products" WHERE "companyId" = ${companyId} AND sku = ${CHEQUE_BOUNCE_PRODUCT_SKU} LIMIT 1
    ` as { id: string }[];
    return row?.id ?? null;
  };
  const existing = await find(prisma);
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cheque_bounce_product:${companyId}`})::bigint)`;
    const again = await find(tx);
    if (again) return again;
    const id = randomUUID();
    await tx.$executeRaw`
      INSERT INTO "products" (id, sku, name, cost, price, "taxRate", "trackStock", "isActive", "companyId", "updatedAt")
      VALUES (${id}, ${CHEQUE_BOUNCE_PRODUCT_SKU}, 'Cheque rechazado', 0, 0, 0, false, false, ${companyId}, NOW())
    `;
    return id;
  });
}

/** Letra de la ND: misma regla que la autoselección de factura del frontend. */
async function salesDebitNoteType(companyId: string, customerId: string): Promise<string> {
  const settings = await container.resolve<IAppSettingsRepository>('AppSettingsRepository').get(companyId).catch(() => null);
  const configured = (settings as any)?.defaultInvoiceType as string | undefined;
  let factura: string;
  if (configured && configured !== 'AUTO') {
    factura = configured;
  } else {
    const companyTax = settings?.companyTaxCondition ?? 'RESPONSABLE_INSCRIPTO';
    const [c] = await prisma.$queryRaw<{ taxCondition: string }[]>`
      SELECT "taxCondition"::text AS "taxCondition" FROM "customers" WHERE id = ${customerId}
    `;
    const customerTax = c?.taxCondition ?? null;
    if (companyTax === 'MONOTRIBUTISTA') factura = 'FACTURA_C';
    else if (companyTax === 'EXENTO') factura = 'FACTURA_B';
    else if (customerTax === 'RESPONSABLE_INSCRIPTO' || customerTax === 'MONOTRIBUTISTA') factura = 'FACTURA_A';
    else factura = 'FACTURA_B';
  }
  return factura.replace('FACTURA_', 'NOTA_DEBITO_');
}

async function createSalesDebitNote(
  p: ChequeBounceParams & { customerId: string; currency: string; reason: string }
): Promise<ChequeBounceResult> {
  const productId = await resolveChequeBounceProductId(p.companyId);
  const type = await salesDebitNoteType(p.companyId, p.customerId);
  const fiscalMode = (p.fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL';

  const invoiceRepo = container.resolve<IInvoiceRepository>('InvoiceRepository');
  const draft = await invoiceRepo.create({
    type,
    customerId: p.customerId,
    userId: p.userId,
    companyId: p.companyId,
    fiscalMode,
    notes: p.reason,
    paymentTerms: 'Cuenta Corriente',
    // Cuenta corriente: es lo que hace que la emisión genere el DEBIT en la CC.
    saleCondition: 'CUENTA_CORRIENTE',
    stockBehavior: 'DISCOUNT',
    currency: p.currency,
    exchangeRate: p.exchangeRate || 1,
    items: [{
      productId,
      detail: p.reason,
      quantity: 1,
      unitPrice: p.amount,
      discountPct: 0,
      taxRate: 0,          // el importe del cheque no es una venta: no gravado
    }],
  } as any);

  // Se emite en el acto (ISSUED + movimiento de CC + asiento), sin ir a ARCA.
  const full = await invoiceRepo.findById(draft.id, p.companyId);
  await leaveDraftIfNeeded(full, { userId: p.userId, companyId: p.companyId, fiscalMode });

  container.resolve<any>('ActivityLogRepository').create({
    userId: p.userId,
    action: 'CREATE',
    entity: 'Invoice',
    entityId: draft.id,
    description: `Nota de Débito ${draft.number} emitida por ${p.reason.toLowerCase()} (sin enviar a ARCA)`,
  }).catch(() => { /* log no crítico */ });

  return { kind: 'SALES_DEBIT_NOTE', id: draft.id, number: draft.number };
}

// ── Nota de Débito de compra ────────────────────────────────────────────────

async function createPurchaseDebitNote(
  p: ChequeBounceParams & { supplierId: string; currency: string; reason: string }
): Promise<ChequeBounceResult> {
  const id = randomUUID();
  const number = p.debitNoteNumber!.trim();
  const type = `NOTA_DEBITO_${p.debitNoteLetter ?? 'A'}`;
  const fiscalMode = p.fiscalMode ?? 'FORMAL';
  const amount = Math.round(p.amount * 100) / 100;

  await prisma.$executeRaw`
    INSERT INTO "purchase_invoices"
      (id, "supplierId", number, type, subtotal, "taxRate", "taxAmount", "discountPct", "discountAmount",
       amount, currency, "exchangeRate", "saleCondition", date, "paymentMethod", status, notes,
       "companyId", "updatedAt", "fiscalMode", "userId")
    VALUES
      (${id}, ${p.supplierId}, ${number}, ${type}, ${amount}, 0, 0, 0, 0,
       ${amount}, ${p.currency}, ${p.exchangeRate || 1}, 'CUENTA_CORRIENTE', NOW(), 'BANK_TRANSFER', 'PENDING', ${p.reason},
       ${p.companyId}, NOW(), ${fiscalMode}, ${p.userId})
  `;
  // Movimiento DEBIT en la cuenta corriente del proveedor.
  await container.resolve<IOrdenPagoRepository>('OrdenPagoRepository').syncPurchaseInvoiceMovements(id);

  container.resolve<any>('ActivityLogRepository').create({
    userId: p.userId,
    action: 'CREATE',
    entity: 'PurchaseInvoice',
    entityId: id,
    description: `Nota de Débito de compra ${number} cargada por ${p.reason.toLowerCase()}`,
  }).catch(() => { /* log no crítico */ });

  return { kind: 'PURCHASE_DEBIT_NOTE', id, number };
}
