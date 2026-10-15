import { Prisma } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import { round2 } from '../utils/money';
import { endOfUtcDay } from '../utils/dateRange';


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
  return (asOf ? endOfUtcDay(asOf) : undefined) ?? new Date();
}

/** Arranque del día de la fecha desde (o null, si no se indicó ninguna). */
export function startOfDay(from?: string): Date | null {
  if (!from) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00.000Z` : from);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Deuda de CLIENTES que estaba impaga a la fecha de corte. Además de facturas y
 * notas de débito de cuenta corriente entra todo lo que genera deuda en la
 * cuenta sin ser una factura: órdenes de pedido en cuenta corriente todavía no
 * facturadas al corte, notas de débito internas (incluye cheques rechazados) y
 * los rechazos de cheque anteriores a las notas internas.
 *
 * Lo cobrado es lo que cada recibo APLICÓ (plata + descuento cedido − recargo,
 * y las compensaciones con saldo a favor), hasta la fecha de corte.
 */
export async function customerDebtAsOf(
  companyId: string,
  cutoff: Date,
  fiscalMode?: string,
  from?: Date | null
): Promise<DebtorDocument[]> {
  const fm = fiscalMode ?? null;
  const since = from ?? null;
  const rows = await prisma.$queryRaw<Array<Omit<DebtorDocument, 'balance'>>>`
    SELECT * FROM (
      -- Facturas y ND de cuenta corriente
      SELECT
        i."customerId" AS "entityId", c.name AS "entityName", c."taxId" AS "taxId",
        i.id AS "documentId", i.number, i.type::text AS type, i.date, i."dueDate",
        i.currency::text AS currency, i.total::float8 AS total,
        COALESCE((
          SELECT SUM(r.amount + r."discountAmount" - r."interestAmount") FROM "recibos" r
          WHERE r."invoiceId" = i.id AND r.status = 'EMITTED' AND r.date <= ${cutoff}
        ), 0)::float8 AS paid
      FROM "invoices" i
      JOIN "customers" c ON c.id = i."customerId"
      WHERE i."companyId" = ${companyId}
        AND (${fm}::text IS NULL OR i."fiscalMode" = ${fm})
        AND i."saleCondition" = 'CUENTA_CORRIENTE'
        AND i.date <= ${cutoff}
        -- La fecha desde acota el reporte a los comprobantes EMITIDOS en el
        -- período; lo cobrado se sigue contando hasta el corte.
        AND (${since}::timestamptz IS NULL OR i.date >= ${since})
        -- El estado de HOY no dice si estaba impaga al corte: solo se excluye lo
        -- que nunca fue deuda (borrador sin emitir, comprobante anulado).
        AND i.status::text NOT IN ('DRAFT', 'CANCELLED')
        AND (i.type::text LIKE 'FACTURA%' OR i.type::text LIKE 'NOTA_DEBITO%')

      UNION ALL

      -- Órdenes de pedido en cuenta corriente: generan la deuda al darse de
      -- alta. Una vez facturadas, la deuda pasa a la factura (no se duplica).
      SELECT
        op."customerId", c.name, c."taxId",
        op.id, op.number, 'ORDEN_PEDIDO', op.date, op."dueDate",
        op.currency::text, op.total::float8,
        COALESCE((
          SELECT SUM(r.amount + r."discountAmount" - r."interestAmount") FROM "recibos" r
          WHERE r."ordenPedidoId" = op.id AND r.status = 'EMITTED' AND r.date <= ${cutoff}
        ), 0)::float8
      FROM "orden_pedidos" op
      JOIN "customers" c ON c.id = op."customerId"
      LEFT JOIN "invoices" inv ON inv.id = op."invoiceId" AND inv.status::text NOT IN ('DRAFT', 'CANCELLED')
      WHERE op."companyId" = ${companyId}
        AND (${fm}::text IS NULL OR op."fiscalMode" = ${fm})
        AND (op."saleCondition" = 'CUENTA_CORRIENTE' OR op."paymentTerms" ~* '[0-9]+\\s*d[ií]as')
        AND op.status <> 'CANCELLED'
        AND op.date <= ${cutoff}
        AND (${since}::timestamptz IS NULL OR op.date >= ${since})
        AND (inv.id IS NULL OR inv.date > ${cutoff})

      UNION ALL

      -- Notas de débito internas (y cheques rechazados desde que son ND interna)
      SELECT
        n."customerId", c.name, c."taxId",
        n.id, n.number, 'ND_INTERNA', n."createdAt", NULL::timestamp,
        n.currency, n.amount::float8, 0::float8
      FROM "internal_notes" n
      JOIN "customers" c ON c.id = n."customerId"
      JOIN "account_movements" m ON m."internalNoteId" = n.id AND m.type = 'DEBIT'
      WHERE n."companyId" = ${companyId}
        AND n.type = 'DEBIT' AND n.status = 'ACTIVE'
        AND (${fm}::text IS NULL OR m."fiscalMode" = ${fm})
        AND n."createdAt" <= ${cutoff}
        AND (${since}::timestamptz IS NULL OR n."createdAt" >= ${since})

      UNION ALL

      -- Cheques rechazados anteriores a las notas internas (movimiento suelto),
      -- neteados contra su reversión.
      SELECT
        g."customerId", c.name, c."taxId",
        g.id, g.ref, 'CHEQUE_RECHAZADO', g.date, NULL::timestamp,
        g.currency, g.total::float8,
        COALESCE((
          SELECT SUM(rv.amount) FROM "account_movements" rv
          WHERE rv."currentAccountId" = g.caid AND rv."internalNoteId" IS NULL AND rv."createdAt" <= ${cutoff}
            AND rv.description = 'Reversión cheque rechazado: ' || g.ref
        ), 0)::float8
      FROM (
        SELECT ca.id AS caid, ca."customerId", ca.currency::text AS currency,
               SUBSTRING(m.description FROM 19) AS ref,
               MIN(m.id) AS id, MIN(m."createdAt") AS date, SUM(m.amount) AS total
        FROM "account_movements" m
        JOIN "current_accounts" ca ON ca.id = m."currentAccountId"
        WHERE m.type = 'DEBIT' AND m."internalNoteId" IS NULL
          AND m.description LIKE 'Cheque rechazado: %'
          AND (${fm}::text IS NULL OR m."fiscalMode" = ${fm})
          AND m."createdAt" <= ${cutoff}
          AND (${since}::timestamptz IS NULL OR m."createdAt" >= ${since})
        GROUP BY ca.id, ca."customerId", ca.currency, SUBSTRING(m.description FROM 19)
      ) g
      JOIN "customers" c ON c.id = g."customerId"
      WHERE c."companyId" = ${companyId}
    ) d
    ORDER BY d.date ASC
  `;
  return withBalance(rows);
}

/**
 * Saldo a favor de CLIENTES a la fecha de corte: notas de crédito (menos lo
 * devuelto o aplicado a facturas), NC internas y pagos a cuenta (menos lo
 * aplicado). Reducen la deuda del cliente.
 */
export async function customerCreditsAsOf(
  companyId: string,
  cutoff: Date,
  fiscalMode?: string,
  from?: Date | null
): Promise<DebtorDocument[]> {
  const fm = fiscalMode ?? null;
  const since = from ?? null;
  const notSystem = Prisma.join([
    'Reversión cheque rechazado:%', 'Anulación nota interna%', 'Reversa por cancelación orden%',
    'Anulación recibo%', 'Cancelled:%', 'Descuento cedido%', 'Anulación %',
  ].map((p) => Prisma.sql`m.description NOT LIKE ${p}`), ' AND ');
  const rows = await prisma.$queryRaw<Array<Omit<DebtorDocument, 'balance'>>>`
    SELECT * FROM (
      -- Notas de crédito de cuenta corriente
      SELECT
        i."customerId" AS "entityId", c.name AS "entityName", c."taxId" AS "taxId",
        i.id AS "documentId", i.number, i.type::text AS type, i.date, i."dueDate",
        i.currency::text AS currency, i.total::float8 AS total,
        COALESCE((
          SELECT SUM(r.amount) FROM "recibos" r
          WHERE (r."invoiceId" = i.id OR r."creditInvoiceId" = i.id) AND r.status = 'EMITTED' AND r.date <= ${cutoff}
        ), 0)::float8 AS paid
      FROM "invoices" i
      JOIN "customers" c ON c.id = i."customerId"
      WHERE i."companyId" = ${companyId}
        AND (${fm}::text IS NULL OR i."fiscalMode" = ${fm})
        AND i."saleCondition" = 'CUENTA_CORRIENTE'
        AND i.date <= ${cutoff}
        AND (${since}::timestamptz IS NULL OR i.date >= ${since})
        AND i.status::text NOT IN ('DRAFT', 'CANCELLED')
        AND i.type::text LIKE 'NOTA_CREDITO%'

      UNION ALL

      -- NC internas y pagos a cuenta (con recibo o movimiento suelto anterior)
      SELECT
        ca."customerId", c.name, c."taxId",
        m.id, COALESCE(n.number, r.number, 'Pago a cuenta'),
        CASE WHEN n.id IS NOT NULL THEN 'NC_INTERNA' ELSE 'PAGO_A_CUENTA' END,
        COALESCE(r.date, m."createdAt"), NULL::timestamp,
        ca.currency::text, m.amount::float8,
        COALESCE((
          SELECT SUM(rc.amount) FROM "recibos" rc
          WHERE rc."creditMovementId" = m.id AND rc.status = 'EMITTED' AND rc.date <= ${cutoff}
        ), 0)::float8
      FROM "account_movements" m
      JOIN "current_accounts" ca ON ca.id = m."currentAccountId"
      JOIN "customers" c ON c.id = ca."customerId"
      LEFT JOIN "internal_notes" n ON n.id = m."internalNoteId"
      LEFT JOIN "recibos" r ON r.id = m."reciboId"
      WHERE c."companyId" = ${companyId}
        AND m.type = 'CREDIT'
        AND m."sourceReciboId" IS NULL
        AND (${fm}::text IS NULL OR m."fiscalMode" = ${fm})
        AND COALESCE(r.date, m."createdAt") <= ${cutoff}
        AND (${since}::timestamptz IS NULL OR COALESCE(r.date, m."createdAt") >= ${since})
        AND (
          (n.id IS NOT NULL AND n.type = 'CREDIT' AND n.status = 'ACTIVE')
          OR (r.id IS NOT NULL AND r.status = 'EMITTED' AND r."invoiceId" IS NULL AND r."budgetId" IS NULL
              AND r."ordenPedidoId" IS NULL AND r."paymentMethod" <> 'COMPENSACION')
          OR (m."internalNoteId" IS NULL AND m."reciboId" IS NULL AND m."invoiceId" IS NULL
              AND m."ordenPedidoId" IS NULL AND m."budgetId" IS NULL AND ${notSystem})
        )
    ) d
    ORDER BY d.date ASC
  `;
  return withBalance(rows);
}

/**
 * Deuda con PROVEEDORES impaga a la fecha de corte: facturas y ND de compra,
 * notas de débito internas (incluye cheques propios rechazados) y rechazos de
 * cheque anteriores a las notas internas.
 *
 * Lo pagado sale de las órdenes de pago ya pagadas con fecha <= corte, llevado
 * a la moneda de la factura (una OP en pesos puede cancelar una factura en USD),
 * más las imputaciones manuales de cuenta corriente.
 */
export async function supplierDebtAsOf(
  companyId: string,
  cutoff: Date,
  fiscalMode?: string,
  from?: Date | null
): Promise<DebtorDocument[]> {
  const fm = fiscalMode ?? null;
  const since = from ?? null;
  const rows = await prisma.$queryRaw<Array<Omit<DebtorDocument, 'balance'>>>`
    SELECT * FROM (
      SELECT
        pi."supplierId" AS "entityId", s.name AS "entityName", s.cuit AS "taxId",
        pi.id AS "documentId", pi.number, pi.type AS type, pi.date, pi."dueDate",
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
        AND (${fm}::text IS NULL OR pi."fiscalMode" = ${fm})
        AND pi."supplierId" IS NOT NULL
        AND pi."saleCondition" = 'CUENTA_CORRIENTE'
        AND pi.date <= ${cutoff}
        -- ver comentario en customerDebtAsOf
        AND (${since}::timestamptz IS NULL OR pi.date >= ${since})
        AND pi.type NOT LIKE 'NOTA_CREDITO%'

      UNION ALL

      -- Notas de débito internas, menos lo imputado contra créditos
      SELECT
        n."supplierId", s.name, s.cuit,
        n.id, n.number, 'ND_INTERNA', n."createdAt", NULL::timestamp,
        sam.currency, n.amount::float8,
        COALESCE((
          SELECT SUM(ai.amount) FROM "supplier_cc_adjustment_items" ai
          JOIN "supplier_cc_adjustments" a ON a.id = ai."adjustmentId"
          WHERE ai.side = 'DEBIT' AND ai."movementId" = sam.id AND a."createdAt" <= ${cutoff}
        ), 0)::float8
      FROM "internal_notes" n
      JOIN "suppliers" s ON s.id = n."supplierId"
      JOIN "supplier_account_movements" sam ON sam."internalNoteId" = n.id AND sam.type = 'DEBIT'
      WHERE n."companyId" = ${companyId}
        AND n.type = 'DEBIT' AND n.status = 'ACTIVE'
        AND (${fm}::text IS NULL OR sam."fiscalMode" = ${fm})
        AND n."createdAt" <= ${cutoff}
        AND (${since}::timestamptz IS NULL OR n."createdAt" >= ${since})

      UNION ALL

      -- Cheques propios rechazados anteriores a las notas internas
      SELECT
        g."supplierId", s.name, s.cuit,
        g.id, g.ref, 'CHEQUE_RECHAZADO', g.date, NULL::timestamp,
        g.currency, g.total::float8,
        COALESCE((
          SELECT SUM(rv.amount) FROM "supplier_account_movements" rv
          WHERE rv."supplierId" = g."supplierId" AND rv.currency = g.currency
            AND rv."internalNoteId" IS NULL AND rv."createdAt" <= ${cutoff}
            AND rv.description = 'Reversión cheque rechazado: ' || g.ref
        ), 0)::float8
      FROM (
        SELECT sam."supplierId", sam.currency, SUBSTRING(sam.description FROM 19) AS ref,
               MIN(sam.id) AS id, MIN(sam."createdAt") AS date, SUM(sam.amount) AS total
        FROM "supplier_account_movements" sam
        WHERE sam."companyId" = ${companyId}
          AND sam.type = 'DEBIT' AND sam."internalNoteId" IS NULL
          AND sam.description LIKE 'Cheque rechazado: %'
          AND (${fm}::text IS NULL OR sam."fiscalMode" = ${fm})
          AND sam."createdAt" <= ${cutoff}
          AND (${since}::timestamptz IS NULL OR sam."createdAt" >= ${since})
        GROUP BY sam."supplierId", sam.currency, SUBSTRING(sam.description FROM 19)
      ) g
      JOIN "suppliers" s ON s.id = g."supplierId"
    ) d
    ORDER BY d.date ASC
  `;
  return withBalance(rows);
}

/**
 * Créditos con PROVEEDORES a la fecha de corte: NC de compra, NC internas
 * (incluye el excedente de una OP) y pagos a cuenta, menos lo imputado.
 */
export async function supplierCreditsAsOf(
  companyId: string,
  cutoff: Date,
  fiscalMode?: string,
  from?: Date | null
): Promise<DebtorDocument[]> {
  const fm = fiscalMode ?? null;
  const since = from ?? null;
  const rows = await prisma.$queryRaw<Array<Omit<DebtorDocument, 'balance'>>>`
    SELECT * FROM (
      SELECT
        pi."supplierId" AS "entityId", s.name AS "entityName", s.cuit AS "taxId",
        pi.id AS "documentId", pi.number, pi.type AS type, pi.date, pi."dueDate",
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
        AND (${fm}::text IS NULL OR pi."fiscalMode" = ${fm})
        AND pi."supplierId" IS NOT NULL
        AND pi."saleCondition" = 'CUENTA_CORRIENTE'
        AND pi.date <= ${cutoff}
        -- ver comentario en customerDebtAsOf
        AND (${since}::timestamptz IS NULL OR pi.date >= ${since})
        AND pi.type LIKE 'NOTA_CREDITO%'

      UNION ALL

      -- NC internas (excedentes de OP incluidos) y pagos a cuenta (OP sin facturas)
      SELECT
        sam."supplierId", s.name, s.cuit,
        sam.id, COALESCE(n.number, op.number, 'Crédito'),
        CASE WHEN n.id IS NOT NULL THEN 'NC_INTERNA' ELSE 'PAGO_A_CUENTA' END,
        COALESCE(op.date, sam."createdAt"), NULL::timestamp,
        sam.currency, sam.amount::float8,
        COALESCE((
          SELECT SUM(ai.amount) FROM "supplier_cc_adjustment_items" ai
          JOIN "supplier_cc_adjustments" a ON a.id = ai."adjustmentId"
          WHERE ai.side = 'CREDIT' AND ai."movementId" = sam.id AND a."createdAt" <= ${cutoff}
        ), 0)::float8
      FROM "supplier_account_movements" sam
      JOIN "suppliers" s ON s.id = sam."supplierId"
      LEFT JOIN "internal_notes" n ON n.id = sam."internalNoteId"
      LEFT JOIN "orden_pagos" op ON op.id = sam."ordenPagoId"
      WHERE sam."companyId" = ${companyId}
        AND sam.type = 'CREDIT'
        AND sam."purchaseInvoiceId" IS NULL
        AND (${fm}::text IS NULL OR sam."fiscalMode" = ${fm})
        AND COALESCE(op.date, sam."createdAt") <= ${cutoff}
        AND (${since}::timestamptz IS NULL OR COALESCE(op.date, sam."createdAt") >= ${since})
        AND (
          (n.id IS NOT NULL AND n.type = 'CREDIT' AND n.status = 'ACTIVE')
          OR (n.id IS NULL AND op.id IS NOT NULL AND op.status = 'PAID' AND sam."ordenPagoAjusteId" IS NULL
              AND NOT EXISTS (SELECT 1 FROM "orden_pago_items" opi WHERE opi."ordenPagoId" = op.id))
        )
    ) d
    ORDER BY d.date ASC
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
