import prisma from '../../infrastructure/database/prisma';

const round2 = (n: number) => Math.round(n * 100) / 100;

export type AgingRow = {
  entityId: string;
  name: string;
  date: Date;
  dueDate: Date | null;
  total: number;
  paid: number;
  /** Moneda del comprobante: lo que no es ARS se convierte antes de sumar. */
  currency?: string;
};

export type AgingEntity = {
  entityId: string;
  name: string;
  notDue: number;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
  docCount: number;
  /** Días de atraso del comprobante vencido más antiguo (0 si nada venció). */
  oldestDays: number;
};

type AgingBucket = keyof Pick<AgingEntity, 'notDue' | 'd0_30' | 'd31_60' | 'd61_90' | 'd90plus'>;

/**
 * Agrupa comprobantes impagos por entidad y balde de antigüedad. La edad se
 * mide desde el vencimiento (o la fecha del comprobante si no tiene); lo que
 * aún no venció va a "notDue".
 *
 * `usdRate` decide qué hacer con las monedas:
 *  - omitido: no se convierte nada (el llamador ya acotó la consulta a UNA
 *    moneda, así que los importes están todos en la misma escala);
 *  - un número: es la cotización del día (la misma que usa el reporte de
 *    deudores) y los importes salen en PESOS — sin esto, un comprobante en
 *    dólares se sumaba por su valor nominal dentro de un total en pesos;
 *  - `null`: hay mezcla de monedas pero no se pudo obtener la cotización, así
 *    que lo que no está en pesos queda AFUERA en vez de ensuciar el total.
 */
export function bucketizeAging(rows: AgingRow[], usdRate?: number | null): AgingEntity[] {
  const byEntity = new Map<string, AgingEntity>();
  const now = Date.now();
  const convert = usdRate !== undefined;
  for (const r of rows) {
    const currency = r.currency ?? 'ARS';
    const rate = !convert || currency === 'ARS' ? 1 : (usdRate && usdRate > 0 ? usdRate : 0);
    if (rate === 0) continue;
    const pending = round2((Number(r.total) - Number(r.paid)) * rate);
    if (pending <= 0.01) continue;
    const base = r.dueDate ?? r.date;
    const days = Math.floor((now - new Date(base).getTime()) / 86400000);
    const bucket: AgingBucket =
      r.dueDate && days <= 0 ? 'notDue'
      : days <= 30 ? 'd0_30'
      : days <= 60 ? 'd31_60'
      : days <= 90 ? 'd61_90'
      : 'd90plus';
    const e = byEntity.get(r.entityId) ?? {
      entityId: r.entityId, name: r.name,
      notDue: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0, docCount: 0, oldestDays: 0,
    };
    e[bucket] = round2(e[bucket] + pending);
    e.total = round2(e.total + pending);
    e.docCount += 1;
    if (bucket !== 'notDue' && days > e.oldestDays) e.oldestDays = days;
    byEntity.set(r.entityId, e);
  }
  return Array.from(byEntity.values()).sort((a, b) => b.total - a.total);
}

/**
 * Comprobantes de venta impagos (facturas y ND de cuenta corriente) con su
 * cobrado, para armar la antigüedad. Con `customerId` se acota a un cliente.
 */
export async function customerAgingRows(
  companyId: string,
  fiscalMode?: string,
  customerId?: string,
  currency?: string
): Promise<AgingRow[]> {
  return prisma.$queryRaw<AgingRow[]>`
    SELECT i."customerId" AS "entityId", c.name, i.date, i."dueDate",
           i.currency::text AS currency,
           i.total::float8 AS total, COALESCE(p.paid, 0)::float8 AS paid
    FROM "invoices" i
    JOIN "customers" c ON c.id = i."customerId"
    LEFT JOIN (
      SELECT "invoiceId", SUM(amount) AS paid
      FROM "recibos" WHERE status = 'EMITTED' GROUP BY "invoiceId"
    ) p ON p."invoiceId" = i.id
    WHERE i."companyId" = ${companyId}
      AND (${fiscalMode ?? null}::text IS NULL OR i."fiscalMode" = ${fiscalMode ?? null})
      AND i."saleCondition" = 'CUENTA_CORRIENTE'
      AND i.status::text IN ('ISSUED', 'AUTHORIZED', 'PARTIALLY_PAID')
      AND (i.type::text LIKE 'FACTURA%' OR i.type::text LIKE 'NOTA_DEBITO%')
      AND (${customerId ?? null}::text IS NULL OR i."customerId" = ${customerId ?? null})
      AND (${currency ?? null}::text IS NULL OR i.currency::text = ${currency ?? null})
  `;
}
