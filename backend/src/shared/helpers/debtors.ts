import prisma from '../../infrastructure/database/prisma';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Deuda a una FECHA DE CORTE.
 *
 * A diferencia del reporte de cuentas por cobrar (que mira el saldo de hoy),
 * acá se reconstruye cuánto se debía en un momento dado. Dos consecuencias que
 * dictan las consultas de abajo:
 *
 *  - NO se puede filtrar por el estado actual del comprobante: una factura que
 *    hoy figura PAID seguía impaga en la fecha de corte si se cobró después.
 *    Solo se descartan los que nunca representaron deuda (borradores, anulados).
 *  - Lo cobrado se cuenta hasta la fecha de corte, no en total.
 *
 * `asOf` es inclusivo: se toma hasta el final de ese día.
 */

export interface DebtorDocument {
  entityId: string;
  entityName: string;
  taxId: string | null;
  documentId: string;
  number: string;
  type: string;
  date: Date;
  dueDate: Date | null;
  currency: string;
  /** Importe del comprobante en su moneda. */
  total: number;
  /** Cobrado/pagado hasta la fecha de corte, en la moneda del comprobante. */
  paid: number;
  /** Saldo adeudado a la fecha de corte (total − paid). */
  balance: number;
}

/** Fin del día de la fecha de corte (o ahora, si no se indicó ninguna). */
export function endOfDay(asOf?: string): Date {
  if (!asOf) return new Date();
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(asOf) ? `${asOf}T23:59:59.999Z` : asOf);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Arranque del día de la fecha desde (o null, si no se indicó ninguna). */
export function startOfDay(from?: string): Date | null {
  if (!from) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00.000Z` : from);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Comprobantes de VENTA que estaban impagos a la fecha de corte.
 *
 * Deuda = facturas y notas de débito de cuenta corriente, menos los recibos
 * emitidos hasta esa fecha. Las notas de crédito no se listan como deuda: se
 * restan del saldo del cliente en `aggregateDebtors`.
 */
export async function customerDebtAsOf(
  companyId: string,
  cutoff: Date,
  fiscalMode?: string,
  from?: Date | null
): Promise<DebtorDocument[]> {
  const rows = await prisma.$queryRaw<Array<Omit<DebtorDocument, 'balance'>>>`
    SELECT
      i."customerId" AS "entityId",
      c.name         AS "entityName",
      c."taxId"      AS "taxId",
      i.id           AS "documentId",
      i.number, i.type::text AS type, i.date, i."dueDate",
      i.currency::text AS currency,
      i.total::float8  AS total,
      COALESCE(p.paid, 0)::float8 AS paid
    FROM "invoices" i
    JOIN "customers" c ON c.id = i."customerId"
    LEFT JOIN (
      SELECT "invoiceId", SUM(amount) AS paid
      FROM "recibos"
      WHERE status = 'EMITTED' AND date <= ${cutoff}
      GROUP BY "invoiceId"
    ) p ON p."invoiceId" = i.id
    WHERE i."companyId" = ${companyId}
      AND (${fiscalMode ?? null}::text IS NULL OR i."fiscalMode" = ${fiscalMode ?? null})
      AND i."saleCondition" = 'CUENTA_CORRIENTE'
      AND i.date <= ${cutoff}
      -- La fecha desde acota el reporte a los comprobantes EMITIDOS en el
      -- período; lo cobrado se sigue contando hasta el corte.
      AND (${from ?? null}::timestamptz IS NULL OR i.date >= ${from ?? null})
      -- El estado de HOY no dice si estaba impaga al corte: solo se excluye lo
      -- que nunca fue deuda (borrador sin emitir, comprobante anulado).
      AND i.status::text NOT IN ('DRAFT', 'CANCELLED')
      AND (i.type::text LIKE 'FACTURA%' OR i.type::text LIKE 'NOTA_DEBITO%')
    ORDER BY i.date ASC
  `;
  return withBalance(rows);
}

/** Notas de crédito de venta emitidas hasta el corte: reducen la deuda del cliente. */
export async function customerCreditsAsOf(
  companyId: string,
  cutoff: Date,
  fiscalMode?: string,
  from?: Date | null
): Promise<DebtorDocument[]> {
  const rows = await prisma.$queryRaw<Array<Omit<DebtorDocument, 'balance'>>>`
    SELECT
      i."customerId" AS "entityId",
      c.name         AS "entityName",
      c."taxId"      AS "taxId",
      i.id           AS "documentId",
      i.number, i.type::text AS type, i.date, i."dueDate",
      i.currency::text AS currency,
      i.total::float8  AS total,
      0::float8        AS paid
    FROM "invoices" i
    JOIN "customers" c ON c.id = i."customerId"
    WHERE i."companyId" = ${companyId}
      AND (${fiscalMode ?? null}::text IS NULL OR i."fiscalMode" = ${fiscalMode ?? null})
      AND i."saleCondition" = 'CUENTA_CORRIENTE'
      AND i.date <= ${cutoff}
      -- La fecha desde acota el reporte a los comprobantes EMITIDOS en el
      -- período; lo cobrado se sigue contando hasta el corte.
      AND (${from ?? null}::timestamptz IS NULL OR i.date >= ${from ?? null})
      AND i.status::text NOT IN ('DRAFT', 'CANCELLED')
      AND i.type::text LIKE 'NOTA_CREDITO%'
    ORDER BY i.date ASC
  `;
  return withBalance(rows);
}

/**
 * Facturas y ND de COMPRA que estaban impagas a la fecha de corte.
 *
 * Lo pagado sale de las órdenes de pago ya pagadas con fecha <= corte, llevado
 * a la moneda de la factura (una OP en pesos puede cancelar una factura en USD).
 */
export async function supplierDebtAsOf(
  companyId: string,
  cutoff: Date,
  fiscalMode?: string,
  from?: Date | null
): Promise<DebtorDocument[]> {
  const rows = await prisma.$queryRaw<Array<Omit<DebtorDocument, 'balance'>>>`
    SELECT
      pi."supplierId" AS "entityId",
      s.name          AS "entityName",
      s.cuit          AS "taxId",
      pi.id           AS "documentId",
      pi.number, pi.type AS type, pi.date, pi."dueDate",
      pi.currency, pi.amount::float8 AS total,
      (COALESCE(op_paid.paid, 0) + COALESCE(adj.applied, 0))::float8 AS paid
    FROM "purchase_invoices" pi
    JOIN "suppliers" s ON s.id = pi."supplierId"
    LEFT JOIN (
      SELECT opi."purchaseInvoiceId",
             SUM(CASE WHEN op.currency = pi2.currency
                      THEN opi.amount
                      ELSE opi.amount / NULLIF(op."exchangeRate", 0) END) AS paid
      FROM "orden_pago_items" opi
      JOIN "orden_pagos" op ON op.id = opi."ordenPagoId"
      JOIN "purchase_invoices" pi2 ON pi2.id = opi."purchaseInvoiceId"
      WHERE op.status = 'PAID' AND op.date <= ${cutoff}
      GROUP BY opi."purchaseInvoiceId"
    ) op_paid ON op_paid."purchaseInvoiceId" = pi.id
    LEFT JOIN (
      -- Imputaciones manuales de cuenta corriente (NC o pagos a cuenta que
      -- cerraron la factura sin pasar por una orden de pago).
      SELECT ai."purchaseInvoiceId", SUM(ai.amount) AS applied
      FROM "supplier_cc_adjustment_items" ai
      JOIN "supplier_cc_adjustments" a ON a.id = ai."adjustmentId"
      WHERE ai.side = 'DEBIT' AND ai."purchaseInvoiceId" IS NOT NULL AND a."createdAt" <= ${cutoff}
      GROUP BY ai."purchaseInvoiceId"
    ) adj ON adj."purchaseInvoiceId" = pi.id
    WHERE pi."companyId" = ${companyId}
      AND (${fiscalMode ?? null}::text IS NULL OR pi."fiscalMode" = ${fiscalMode ?? null})
      AND pi."supplierId" IS NOT NULL
      AND pi."saleCondition" = 'CUENTA_CORRIENTE'
      AND pi.date <= ${cutoff}
      -- ver comentario en customerDebtAsOf
      AND (${from ?? null}::timestamptz IS NULL OR pi.date >= ${from ?? null})
      AND pi.type NOT LIKE 'NOTA_CREDITO%'
    ORDER BY pi.date ASC
  `;
  return withBalance(rows);
}

/** Notas de crédito de compra hasta el corte: reducen lo que le debemos al proveedor. */
export async function supplierCreditsAsOf(
  companyId: string,
  cutoff: Date,
  fiscalMode?: string,
  from?: Date | null
): Promise<DebtorDocument[]> {
  const rows = await prisma.$queryRaw<Array<Omit<DebtorDocument, 'balance'>>>`
    SELECT
      pi."supplierId" AS "entityId",
      s.name          AS "entityName",
      s.cuit          AS "taxId",
      pi.id           AS "documentId",
      pi.number, pi.type AS type, pi.date, pi."dueDate",
      pi.currency, pi.amount::float8 AS total,
      COALESCE(adj.applied, 0)::float8 AS paid
    FROM "purchase_invoices" pi
    JOIN "suppliers" s ON s.id = pi."supplierId"
    LEFT JOIN (
      SELECT ai."purchaseInvoiceId", SUM(ai.amount) AS applied
      FROM "supplier_cc_adjustment_items" ai
      JOIN "supplier_cc_adjustments" a ON a.id = ai."adjustmentId"
      WHERE ai.side = 'CREDIT' AND ai."purchaseInvoiceId" IS NOT NULL AND a."createdAt" <= ${cutoff}
      GROUP BY ai."purchaseInvoiceId"
    ) adj ON adj."purchaseInvoiceId" = pi.id
    WHERE pi."companyId" = ${companyId}
      AND (${fiscalMode ?? null}::text IS NULL OR pi."fiscalMode" = ${fiscalMode ?? null})
      AND pi."supplierId" IS NOT NULL
      AND pi."saleCondition" = 'CUENTA_CORRIENTE'
      AND pi.date <= ${cutoff}
      -- ver comentario en customerDebtAsOf
      AND (${from ?? null}::timestamptz IS NULL OR pi.date >= ${from ?? null})
      AND pi.type LIKE 'NOTA_CREDITO%'
    ORDER BY pi.date ASC
  `;
  return withBalance(rows);
}

function withBalance(rows: Array<Omit<DebtorDocument, 'balance'>>): DebtorDocument[] {
  return rows
    .map((r) => ({ ...r, total: Number(r.total), paid: Number(r.paid), balance: round2(Number(r.total) - Number(r.paid)) }))
    .filter((r) => r.balance > 0.005);
}

// ── Agregación por deudor ───────────────────────────────────────────────────

export type DebtorBucket = 'notDue' | 'd0_30' | 'd31_60' | 'd61_90' | 'd90plus';

export interface DebtorSummary {
  entityId: string;
  entityName: string;
  taxId: string | null;
  /** Saldo total adeudado a la fecha de corte, convertido a pesos. */
  balanceArs: number;
  /** Saldo por moneda de origen, para no perder el importe real en USD. */
  byCurrency: Record<string, number>;
  notDue: number;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  docCount: number;
  /** Días de atraso del comprobante vencido más antiguo, a la fecha de corte. */
  oldestDays: number;
  /** Comprobantes que componen el saldo (con su importe en pesos). */
  documents: Array<DebtorDocument & { balanceArs: number; overdueDays: number }>;
  /** Créditos (NC) que ya se descontaron del saldo. */
  creditsArs: number;
}

/**
 * Arma el resumen por deudor: convierte a pesos, reparte por antigüedad y
 * descuenta las notas de crédito.
 *
 * La antigüedad se mide **contra la fecha de corte**, no contra hoy: en un
 * reporte al 30/09 un comprobante vencido el 15/09 estaba atrasado 15 días, no
 * los que pasaron hasta ahora.
 *
 * `rate` es la cotización USD→ARS; si no hay, los importes en moneda extranjera
 * quedan fuera del total en pesos (y se informan en `byCurrency`).
 */
export function aggregateDebtors(
  debts: DebtorDocument[],
  credits: DebtorDocument[],
  cutoff: Date,
  rate: number | null
): DebtorSummary[] {
  const toArs = (amount: number, currency: string): number | null => {
    if (currency === 'ARS') return amount;
    if (!rate || rate <= 0) return null;
    return round2(amount * rate);
  };
  const cutoffMs = cutoff.getTime();

  const byEntity = new Map<string, DebtorSummary>();
  const blank = (d: DebtorDocument): DebtorSummary => ({
    entityId: d.entityId, entityName: d.entityName, taxId: d.taxId,
    balanceArs: 0, byCurrency: {}, notDue: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0,
    docCount: 0, oldestDays: 0, documents: [], creditsArs: 0,
  });

  for (const d of debts) {
    const e = byEntity.get(d.entityId) ?? blank(d);
    const ars = toArs(d.balance, d.currency);

    const base = d.dueDate ?? d.date;
    const days = Math.floor((cutoffMs - new Date(base).getTime()) / 86400000);
    const bucket: DebtorBucket =
      d.dueDate && days <= 0 ? 'notDue'
      : days <= 30 ? 'd0_30'
      : days <= 60 ? 'd31_60'
      : days <= 90 ? 'd61_90'
      : 'd90plus';

    if (ars !== null) {
      e.balanceArs = round2(e.balanceArs + ars);
      e[bucket] = round2(e[bucket] + ars);
    }
    e.byCurrency[d.currency] = round2((e.byCurrency[d.currency] ?? 0) + d.balance);
    e.docCount += 1;
    if (bucket !== 'notDue' && days > e.oldestDays) e.oldestDays = days;
    e.documents.push({ ...d, balanceArs: ars ?? 0, overdueDays: bucket === 'notDue' ? 0 : days });
    byEntity.set(d.entityId, e);
  }

  // Las NC bajan el saldo del deudor pero no entran en los baldes de
  // antigüedad: no son deuda vencida, son crédito a su favor.
  for (const c of credits) {
    const e = byEntity.get(c.entityId) ?? blank(c);
    const ars = toArs(c.balance, c.currency);
    if (ars !== null) {
      e.balanceArs = round2(e.balanceArs - ars);
      e.creditsArs = round2(e.creditsArs + ars);
    }
    e.byCurrency[c.currency] = round2((e.byCurrency[c.currency] ?? 0) - c.balance);
    byEntity.set(c.entityId, e);
  }

  return Array.from(byEntity.values())
    .filter((e) => Math.abs(e.balanceArs) > 0.005 || Object.values(e.byCurrency).some((v) => Math.abs(v) > 0.005))
    .sort((a, b) => b.balanceArs - a.balanceArs);
}
