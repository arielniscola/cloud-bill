import { Prisma, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { randomUUID } from 'crypto';
import { AppError } from '../../../shared/errors/AppError';

// Lotes y vencimientos. Todo por SQL crudo: el cliente Prisma puede no conocer
// las tablas nuevas (lock del engine en Windows con el server corriendo).
//
// Invariante: para un producto con `trackLots`, la suma de sus lotes en un
// depósito es `stocks.quantity` de ese depósito. Lo mantiene `applyLotMovement`,
// que corre dentro de cada movimiento de stock (bajo el mismo advisory lock).

type Client = Prisma.TransactionClient | PrismaClient;

/** Lote sin identificar: stock previo a activar lotes, o ingresos sin lote cargado. */
export const NO_LOT_NUMBER = 'S/L';

/** Lote pedido por el llamador. Para salidas: `lotId` o `lotNumber`; para entradas además `expiresAt`. */
export interface LotSpec {
  lotId?: string;
  lotNumber?: string;
  expiresAt?: string | Date | null;
  quantity: number;
}

export interface LotAllocation {
  lotId: string;
  lotNumber: string;
  expiresAt: string | null;
  quantity: number;
}

type RawLot = {
  id: string;
  lotNumber: string;
  expiresAt: Date | null;
  quantity: string | number;
  createdAt: Date;
};

const OUTGOING = ['SALE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'REMITO_OUT'];

export const isOutgoingType = (type: string) => OUTGOING.includes(type);

/** 'YYYY-MM-DD' o null. Acepta Date, ISO o 'YYYY-MM-DD'. */
export function toDateOnly(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m ? m[1] : null;
}

const fmtExp = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function tracksLots(client: Client, productId: string): Promise<boolean> {
  const rows = await client.$queryRaw<{ trackLots: boolean | null; trackStock: boolean | null }[]>`
    SELECT "trackLots", "trackStock" FROM "products" WHERE id = ${productId} LIMIT 1
  `;
  return rows[0] ? rows[0].trackLots === true && rows[0].trackStock !== false : false;
}

async function lotsOf(client: Client, productId: string, variantId: string | null, warehouseId: string): Promise<RawLot[]> {
  return client.$queryRaw<RawLot[]>`
    SELECT id, "lotNumber", "expiresAt", quantity, "createdAt"
    FROM "stock_lots"
    WHERE "productId" = ${productId} AND "variantId" IS NOT DISTINCT FROM ${variantId} AND "warehouseId" = ${warehouseId}
  `;
}

async function findOrCreateLot(
  tx: Client,
  key: { productId: string; variantId: string | null; warehouseId: string },
  lotNumber: string,
  expiresAt: string | null,
): Promise<RawLot> {
  const number = lotNumber.trim() || NO_LOT_NUMBER;
  const found = await tx.$queryRaw<RawLot[]>`
    SELECT id, "lotNumber", "expiresAt", quantity, "createdAt" FROM "stock_lots"
    WHERE "productId" = ${key.productId} AND "variantId" IS NOT DISTINCT FROM ${key.variantId}
      AND "warehouseId" = ${key.warehouseId} AND "lotNumber" = ${number}
    LIMIT 1
  `;
  if (found[0]) {
    // Un lote cargado antes sin vencimiento lo toma del primer ingreso que lo trae.
    if (!found[0].expiresAt && expiresAt) {
      await tx.$executeRaw`UPDATE "stock_lots" SET "expiresAt" = ${expiresAt}::date, "updatedAt" = NOW() WHERE id = ${found[0].id}`;
      found[0].expiresAt = new Date(`${expiresAt}T00:00:00Z`);
    }
    return found[0];
  }
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "stock_lots" (id, "productId", "variantId", "warehouseId", "lotNumber", "expiresAt", quantity, "createdAt", "updatedAt")
    VALUES (${id}, ${key.productId}, ${key.variantId}, ${key.warehouseId}, ${number}, ${expiresAt}::date, 0, NOW(), NOW())
  `;
  return { id, lotNumber: number, expiresAt: expiresAt ? new Date(`${expiresAt}T00:00:00Z`) : null, quantity: 0, createdAt: new Date() };
}

/**
 * Neto por lote que un comprobante sacó (positivo) o metió (negativo) de este
 * producto/variante/depósito. Sirve para que una anulación devuelva al mismo
 * lote del que salió la mercadería, y para que anular un ingreso saque del
 * lote que ese ingreso creó.
 */
async function netOutByReference(
  tx: Client,
  referenceId: string,
  key: { productId: string; variantId: string | null; warehouseId: string },
): Promise<Map<string, Decimal>> {
  const rows = await tx.$queryRaw<{ lotId: string; net: string | number }[]>`
    SELECT sml."lotId",
           SUM(CASE WHEN m.type::text IN ('SALE','ADJUSTMENT_OUT','TRANSFER_OUT','REMITO_OUT')
                    THEN sml.quantity ELSE -sml.quantity END) AS net
    FROM "stock_movement_lots" sml
    JOIN "stock_movements" m ON m.id = sml."movementId"
    WHERE m."referenceId" = ${referenceId}
      AND m."productId" = ${key.productId}
      AND m."variantId" IS NOT DISTINCT FROM ${key.variantId}
      AND m."warehouseId" = ${key.warehouseId}
    GROUP BY sml."lotId"
  `;
  return new Map(rows.map((r) => [r.lotId, new Decimal(r.net)]));
}

/** Vence antes primero; los vencidos y los sin vencimiento al final. */
function fefo(lots: RawLot[]): RawLot[] {
  const today = new Date().toISOString().slice(0, 10);
  const rank = (l: RawLot) => {
    const exp = fmtExp(l.expiresAt);
    if (!exp) return 1;           // sin vencimiento (incluye S/L)
    return exp < today ? 2 : 0;   // vigente / vencido
  };
  return [...lots].sort((a, b) =>
    rank(a) - rank(b)
    || (fmtExp(a.expiresAt) ?? '').localeCompare(fmtExp(b.expiresAt) ?? '')
    || a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * Reparte un movimiento de stock entre lotes y lo registra. Corre dentro de la
 * transacción (y del advisory lock) del movimiento.
 *
 * Salidas: primero los lotes pedidos; después, si es la anulación de un ingreso,
 * los lotes que ese ingreso creó; el resto, FEFO salteando vencidos mientras haya
 * vigentes. Entradas: los lotes pedidos; después, si es la anulación de una
 * salida, los lotes de los que salió; el resto al lote S/L.
 */
export async function applyLotMovement(
  tx: Client,
  data: {
    movementId: string;
    productId: string;
    variantId: string | null;
    warehouseId: string;
    type: string;
    quantity: Decimal;
    referenceId?: string | null;
    lots?: LotSpec[] | null;
    productName: string;
  },
): Promise<LotAllocation[]> {
  const key = { productId: data.productId, variantId: data.variantId, warehouseId: data.warehouseId };
  const outgoing = isOutgoingType(data.type);
  const plan = new Map<string, { lot: RawLot; qty: Decimal }>();
  const add = (lot: RawLot, qty: Decimal) => {
    if (qty.lte(0)) return;
    const cur = plan.get(lot.id);
    plan.set(lot.id, { lot, qty: cur ? cur.qty.plus(qty) : qty });
  };
  let remaining = data.quantity;

  const requested = (data.lots ?? []).filter((l) => Number(l.quantity) > 0);
  const requestedTotal = requested.reduce((acc, l) => acc.plus(l.quantity), new Decimal(0));
  if (requestedTotal.greaterThan(data.quantity)) {
    throw new AppError(`Los lotes asignados a "${data.productName}" suman ${requestedTotal} y la cantidad es ${data.quantity}`, 400);
  }

  const existing = await lotsOf(tx, data.productId, data.variantId, data.warehouseId);
  const byId = new Map(existing.map((l) => [l.id, l]));
  const byNumber = new Map(existing.map((l) => [l.lotNumber, l]));

  if (outgoing) {
    // Lo que ya está comprometido en este mismo movimiento no se vuelve a ofrecer.
    const left = (lot: RawLot) => new Decimal(lot.quantity).minus(plan.get(lot.id)?.qty ?? 0);

    for (const spec of requested) {
      const lot = (spec.lotId && byId.get(spec.lotId)) || (spec.lotNumber && byNumber.get(spec.lotNumber.trim())) || null;
      if (!lot) {
        throw new AppError(`El lote ${spec.lotNumber ?? spec.lotId} de "${data.productName}" no existe en el depósito`, 400);
      }
      const q = new Decimal(spec.quantity);
      if (left(lot).lessThan(q)) {
        throw new AppError(`El lote ${lot.lotNumber} de "${data.productName}" tiene ${left(lot)} y se pidieron ${q}`, 400);
      }
      add(lot, q);
      remaining = remaining.minus(q);
    }

    if (remaining.greaterThan(0) && data.referenceId) {
      const net = await netOutByReference(tx, data.referenceId, key);
      for (const [lotId, n] of net) {
        if (remaining.lte(0)) break;
        const lot = byId.get(lotId);
        if (!lot || n.gte(0)) continue; // solo lotes que este comprobante INGRESÓ
        const q = Decimal.min(n.neg(), left(lot), remaining);
        add(lot, q);
        remaining = remaining.minus(q);
      }
    }

    for (const lot of fefo(existing)) {
      if (remaining.lte(0)) break;
      const q = Decimal.min(left(lot), remaining);
      if (q.lte(0)) continue;
      add(lot, q);
      remaining = remaining.minus(q);
    }

    if (remaining.greaterThan(0)) {
      throw new AppError(
        `Los lotes de "${data.productName}" en el depósito no alcanzan (faltan ${remaining}). Revisá el stock por lote.`,
        400,
      );
    }
  } else {
    for (const spec of requested) {
      const lot = spec.lotId && byId.get(spec.lotId)
        ? byId.get(spec.lotId)!
        : await findOrCreateLot(tx, key, spec.lotNumber ?? NO_LOT_NUMBER, toDateOnly(spec.expiresAt));
      const q = new Decimal(spec.quantity);
      add(lot, q);
      remaining = remaining.minus(q);
    }

    if (remaining.greaterThan(0) && data.referenceId) {
      const net = await netOutByReference(tx, data.referenceId, key);
      for (const [lotId, n] of net) {
        if (remaining.lte(0)) break;
        const lot = byId.get(lotId);
        if (!lot || n.lte(0)) continue; // solo lotes de los que este comprobante SACÓ
        const q = Decimal.min(n, remaining);
        add(lot, q);
        remaining = remaining.minus(q);
      }
    }

    if (remaining.greaterThan(0)) {
      add(await findOrCreateLot(tx, key, NO_LOT_NUMBER, null), remaining);
    }
  }

  const sign = outgoing ? -1 : 1;
  const allocations: LotAllocation[] = [];
  for (const { lot, qty } of plan.values()) {
    await tx.$executeRaw`
      UPDATE "stock_lots" SET quantity = quantity + ${qty.mul(sign).toString()}::decimal, "updatedAt" = NOW()
      WHERE id = ${lot.id}
    `;
    await tx.$executeRaw`
      INSERT INTO "stock_movement_lots" (id, "movementId", "lotId", quantity)
      VALUES (${randomUUID()}, ${data.movementId}, ${lot.id}, ${qty.toString()}::decimal)
    `;
    allocations.push({ lotId: lot.id, lotNumber: lot.lotNumber, expiresAt: fmtExp(lot.expiresAt), quantity: qty.toNumber() });
  }
  return allocations;
}

/**
 * Deja los lotes de un producto cuadrados con su stock: la diferencia entre
 * `stocks.quantity` y la suma de los lotes va al lote S/L (al activar lotes en
 * un producto con stock, todo el stock existente cae ahí).
 */
export async function reconcileLots(tx: Client, productId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ variantId: string | null; warehouseId: string; quantity: string; lots: string | null }[]>`
    SELECT s."variantId", s."warehouseId", s.quantity,
           (SELECT SUM(l.quantity) FROM "stock_lots" l
             WHERE l."productId" = s."productId" AND l."variantId" IS NOT DISTINCT FROM s."variantId"
               AND l."warehouseId" = s."warehouseId") AS lots
    FROM "stocks" s WHERE s."productId" = ${productId}
  `;
  for (const r of rows) {
    const diff = new Decimal(r.quantity).minus(new Decimal(r.lots ?? 0));
    if (diff.isZero()) continue;
    const lot = await findOrCreateLot(tx, { productId, variantId: r.variantId, warehouseId: r.warehouseId }, NO_LOT_NUMBER, null);
    await tx.$executeRaw`
      UPDATE "stock_lots" SET quantity = GREATEST(quantity + ${diff.toString()}::decimal, 0), "updatedAt" = NOW()
      WHERE id = ${lot.id}
    `;
  }
}

/** Lotes que un comprobante movió (neto que salió), por producto/variante. Para detalle e impresión. */
export async function lotsDeliveredByReference(
  client: Client,
  referenceIds: string[],
): Promise<{ productId: string; variantId: string | null; lotNumber: string; expiresAt: string | null; quantity: number }[]> {
  if (referenceIds.length === 0) return [];
  const rows = await client.$queryRaw<{ productId: string; variantId: string | null; lotNumber: string; expiresAt: Date | null; net: string | number }[]>`
    SELECT m."productId", m."variantId", l."lotNumber", l."expiresAt",
           SUM(CASE WHEN m.type::text IN ('SALE','ADJUSTMENT_OUT','TRANSFER_OUT','REMITO_OUT')
                    THEN sml.quantity ELSE -sml.quantity END) AS net
    FROM "stock_movement_lots" sml
    JOIN "stock_movements" m ON m.id = sml."movementId"
    JOIN "stock_lots" l ON l.id = sml."lotId"
    WHERE m."referenceId" IN (${Prisma.join(referenceIds)})
    GROUP BY m."productId", m."variantId", l."lotNumber", l."expiresAt"
    HAVING SUM(CASE WHEN m.type::text IN ('SALE','ADJUSTMENT_OUT','TRANSFER_OUT','REMITO_OUT')
                    THEN sml.quantity ELSE -sml.quantity END) <> 0
    ORDER BY l."expiresAt" NULLS LAST, l."lotNumber"
  `;
  return rows.map((r) => ({
    productId: r.productId,
    variantId: r.variantId,
    lotNumber: r.lotNumber,
    expiresAt: fmtExp(r.expiresAt),
    quantity: Math.abs(Number(r.net)),
  }));
}
