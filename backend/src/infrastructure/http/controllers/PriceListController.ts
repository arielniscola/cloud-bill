import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { container } from 'tsyringe';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';
import { AppError } from '../../../shared/errors/AppError';
import { exchangeRateService } from '../../services/ExchangeRateService';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';

/**
 * Lista de precios: precios de venta y costos (con y sin IVA) y margen de
 * cada producto, filtrando por proveedor, categoría o rubro. Desde acá se
 * actualizan los precios en pesos con la cotización del dólar del día.
 */

const filterSchema = z.object({
  search: z.string().trim().max(100).optional(),
  supplierId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  rubroId: z.string().uuid().optional(),
  // Solo los que tienen precio/costo en USD (para elegir qué actualizar).
  usd: z.enum(['SALE', 'COST', 'ANY']).optional(),
  includeInactive: z.coerce.boolean().optional(),
});

const listSchema = filterSchema.extend({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(100),
  sort: z.enum(['name', 'sku', 'price', 'cost', 'margin', 'changed']).default('name'),
  dir: z.enum(['asc', 'desc']).default('asc'),
});

const updateSchema = z.object({
  /** SALE_USD: precio = precio de venta USD × cotización. COST_USD: costo = costo USD × cotización, manteniendo el margen. */
  mode: z.enum(['SALE_USD', 'COST_USD']),
  rate: z.number().positive().optional(),
  ids: z.array(z.string().uuid()).max(5000).optional(),
  /** En lugar de ids: todos los productos que cumplen el filtro. */
  filter: filterSchema.optional(),
}).refine((d) => (d.ids && d.ids.length > 0) || d.filter, 'Seleccioná al menos un producto');

const adjustSchema = z.object({
  /** PRICE/COST: sube o baja ese valor (por % o monto). MARGIN: fija el margen y recalcula el precio desde el costo. */
  target: z.enum(['PRICE', 'COST', 'MARGIN']),
  /** Para PRICE/COST. */
  type: z.enum(['PERCENT', 'AMOUNT']).default('PERCENT'),
  /** % o monto (puede ser negativo para bajar). En MARGIN es el margen objetivo (0–95). */
  value: z.number().finite(),
  /** Solo COST: el precio de venta se mueve en la misma proporción (mantiene el margen). */
  keepMargin: z.boolean().default(false),
  /** Redondea el precio de venta resultante al múltiplo más cercano (0 = centavos). */
  rounding: z.union([z.literal(0), z.literal(1), z.literal(10), z.literal(50), z.literal(100)]).default(0),
  ids: z.array(z.string().uuid()).max(5000).optional(),
  filter: filterSchema.optional(),
}).refine((d) => (d.ids && d.ids.length > 0) || d.filter, 'Seleccioná al menos un producto')
  .refine((d) => d.target !== 'MARGIN' || (d.value >= 0 && d.value <= 95), 'El margen debe estar entre 0 y 95 %')
  .refine((d) => d.target === 'MARGIN' || d.type !== 'PERCENT' || d.value > -100, 'El porcentaje debe ser mayor a -100');

const editSchema = z.object({
  id: z.string().uuid(),
  price: z.number().min(0).max(1e9).optional(),
  cost: z.number().min(0).max(1e9).optional(),
  /** Margen sobre el precio (0–95): recalcula el precio desde el costo. */
  margin: z.number().min(0).max(95).optional(),
  /** Al cambiar el costo, el precio se mueve en la misma proporción. */
  keepMargin: z.boolean().default(false),
}).refine((d) => [d.price, d.cost, d.margin].filter((x) => x !== undefined).length === 1, 'Indicá un solo valor a cambiar');

const importMatchSchema = z.object({ codes: z.array(z.string().trim().min(1).max(100)).min(1).max(5000) });

const importApplySchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), cost: z.number().min(0).max(1e9) })).min(1).max(5000),
  /** El costo del archivo trae IVA incluido (se descuenta la alícuota del producto). */
  costIncludesTax: z.boolean().default(false),
  keepMargin: z.boolean().default(true),
  rounding: z.union([z.literal(0), z.literal(1), z.literal(10), z.literal(50), z.literal(100)]).default(0),
});

type Filter = z.infer<typeof filterSchema>;

function whereFor(companyId: string, f: Filter): Prisma.Sql {
  const like = `%${f.search ?? ''}%`;
  return Prisma.sql`
    p."companyId" = ${companyId}
    ${f.includeInactive ? Prisma.empty : Prisma.sql`AND p."isActive" = true`}
    ${f.supplierId ? Prisma.sql`AND p."supplierId" = ${f.supplierId}` : Prisma.empty}
    ${f.categoryId ? Prisma.sql`AND p."categoryId" = ${f.categoryId}` : Prisma.empty}
    ${f.rubroId ? Prisma.sql`AND (p."rubroId" = ${f.rubroId} OR p."rubroId" IN (SELECT id FROM rubros WHERE "parentId" = ${f.rubroId}))` : Prisma.empty}
    ${f.usd === 'SALE' ? Prisma.sql`AND p."salePriceUSD" > 0` : Prisma.empty}
    ${f.usd === 'COST' ? Prisma.sql`AND p."costUSD" > 0` : Prisma.empty}
    ${f.usd === 'ANY' ? Prisma.sql`AND (p."salePriceUSD" > 0 OR p."costUSD" > 0)` : Prisma.empty}
    ${f.search ? Prisma.sql`AND (p.sku ILIKE ${like} OR p.name ILIKE ${like} OR p.description ILIKE ${like} OR p.barcode ILIKE ${like})` : Prisma.empty}
  `;
}

const ORDER: Record<string, string> = {
  name: 'lower(p.name)',
  sku: 'lower(p.sku)',
  price: 'p.price',
  cost: 'p.cost',
  margin: 'CASE WHEN p.price > 0 THEN (p.price - p.cost) / p.price END',
  changed: 'lc."createdAt"',
};

export class PriceListController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = listSchema.parse(req.query);
      const where = whereFor(req.companyId!, q);
      const order = Prisma.raw(`${ORDER[q.sort]} ${q.dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, lower(p.name)`);
      const [rows, [summary], [last]] = await Promise.all([
        prisma.$queryRaw<any[]>`
          SELECT p.id, p.sku, p.name, p.description, p."isActive",
                 p.price::float AS price, p.cost::float AS cost, p."taxRate"::float AS "taxRate",
                 p."salePriceUSD"::float AS "salePriceUSD", p."costUSD"::float AS "costUSD",
                 p."costUsdRate"::float AS "costUsdRate", p."priceUpdatedAt",
                 s.name AS "supplierName", c.name AS "categoryName",
                 lc."createdAt" AS "lastChangeAt", lc.source AS "lastChangeSource",
                 lc."oldPrice"::float AS "lastOldPrice", lc."newPrice"::float AS "lastNewPrice",
                 lc."oldCost"::float AS "lastOldCost", lc."newCost"::float AS "lastNewCost"
          FROM products p
          LEFT JOIN suppliers s ON s.id = p."supplierId"
          LEFT JOIN categories c ON c.id = p."categoryId"
          LEFT JOIN LATERAL (
            SELECT h."createdAt", h.source, h."oldPrice", h."newPrice", h."oldCost", h."newCost"
            FROM product_price_history h
            WHERE h."productId" = p.id
              AND (h."newPrice" IS DISTINCT FROM h."oldPrice" OR h."newCost" IS DISTINCT FROM h."oldCost")
            ORDER BY h."createdAt" DESC LIMIT 1
          ) lc ON TRUE
          WHERE ${where}
          ORDER BY ${order}
          LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}
        `,
        prisma.$queryRaw<{ total: number; withSaleUsd: number; withCostUsd: number }[]>`
          SELECT COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE p."salePriceUSD" > 0)::int AS "withSaleUsd",
                 COUNT(*) FILTER (WHERE p."costUSD" > 0)::int AS "withCostUsd"
          FROM products p WHERE ${where}
        `,
        // Dólar de la última actualización hecha CON el dólar en la empresa (lista
        // de precios o recálculo de costos USD), sacado del historial de precios:
        // costo nuevo / costo USD si cambió el costo, si no precio nuevo / venta USD.
        prisma.$queryRaw<{ rate: number | null; at: Date | null }[]>`
          SELECT ROUND(CASE
                   WHEN h."newCost" IS DISTINCT FROM h."oldCost" AND p."costUSD" > 0 THEN h."newCost" / p."costUSD"
                   ELSE h."newPrice" / NULLIF(p."salePriceUSD", 0)
                 END, 2)::float AS rate,
                 h."createdAt" AS at
          FROM product_price_history h
          JOIN products p ON p.id = h."productId"
          WHERE h."companyId" = ${req.companyId!} AND h.source IN ('PRICE_LIST_RATE', 'USD_RECALC')
          ORDER BY h."createdAt" DESC
          LIMIT 1
        `,
      ]);
      res.json({
        status: 'success',
        data: rows,
        total: summary.total,
        totalPages: Math.max(1, Math.ceil(summary.total / q.limit)),
        page: q.page,
        summary: { ...summary, lastRate: last?.rate ?? null, lastRateAt: last?.at ?? null },
      });
    } catch (error) { next(error); }
  };

  updateFromRate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = updateSchema.parse(req.body);
      let rate = data.rate;
      if (!rate) {
        const today = await exchangeRateService.getUsdRate();
        if (!today) throw new AppError('No se pudo obtener la cotización del día; ingresala a mano', 400);
        rate = today.rate;
      }
      const r = new Prisma.Decimal(rate);
      const companyId = req.companyId!;
      const scope = data.ids && data.ids.length > 0
        ? Prisma.sql`p."companyId" = ${companyId} AND p.id IN (${Prisma.join(data.ids)})`
        : whereFor(companyId, data.filter!);
      const ref = randomUUID();
      const userId = req.user?.userId ?? null;

      // Productos alcanzados que no tienen el valor en USD que hace falta.
      const usdCol = Prisma.raw(data.mode === 'SALE_USD' ? '"salePriceUSD"' : '"costUSD"');
      const [{ selected, eligible }] = await prisma.$queryRaw<{ selected: number; eligible: number }[]>`
        SELECT COUNT(*)::int AS selected, COUNT(*) FILTER (WHERE p.${usdCol} > 0)::int AS eligible
        FROM products p WHERE ${scope}
      `;
      if (eligible === 0) {
        throw new AppError(
          data.mode === 'SALE_USD'
            ? 'Ninguno de los productos elegidos tiene precio de venta en USD'
            : 'Ninguno de los productos elegidos tiene costo en USD',
          400,
        );
      }

      // En el SET, `cost` y `price` se leen con su valor ANTERIOR (Postgres).
      const updated = data.mode === 'SALE_USD'
        ? await prisma.$executeRaw`
            UPDATE products p SET
              price = ROUND(p."salePriceUSD" * ${r}::numeric, 2),
              "priceUpdatedAt" = NOW(),
              "priceCtxSource" = 'PRICE_LIST_RATE', "priceCtxUserId" = ${userId}, "priceCtxRef" = ${ref},
              "updatedAt" = NOW()
            WHERE ${scope} AND p."salePriceUSD" > 0
          `
        : await prisma.$executeRaw`
            UPDATE products p SET
              price = CASE WHEN p.cost > 0 THEN ROUND(p.price * ROUND(p."costUSD" * ${r}::numeric, 2) / p.cost, 2) ELSE p.price END,
              cost = ROUND(p."costUSD" * ${r}::numeric, 2),
              "costUsdRate" = ${r}::numeric,
              "priceUpdatedAt" = NOW(),
              "priceCtxSource" = 'PRICE_LIST_RATE', "priceCtxUserId" = ${userId}, "priceCtxRef" = ${ref},
              "updatedAt" = NOW()
            WHERE ${scope} AND p."costUSD" > 0
          `;

      container.resolve<IActivityLogRepository>('ActivityLogRepository').create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'Product',
        entityId: 'price-list-rate',
        description: `Lista de precios: ${updated} producto(s) actualizados con dólar $${rate} (${data.mode === 'SALE_USD' ? 'precio de venta USD' : 'costo USD manteniendo margen'})`,
      }).catch(() => { /* log no crítico */ });

      res.json({ status: 'success', data: { updated, skipped: selected - updated, rate, ref } });
    } catch (error) { next(error); }
  };

  /**
   * Ajuste en pesos, sin cotización: sube/baja el precio o el costo por % o monto
   * (el costo puede arrastrar al precio para mantener el margen), o fija un margen.
   */
  adjust = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const d = adjustSchema.parse(req.body);
      const companyId = req.companyId!;
      const scope = d.ids && d.ids.length > 0
        ? Prisma.sql`p."companyId" = ${companyId} AND p.id IN (${Prisma.join(d.ids)})`
        : whereFor(companyId, d.filter!);
      const ref = randomUUID();
      const userId = req.user?.userId ?? null;
      const v = new Prisma.Decimal(d.value);

      // Expresiones con los valores ANTERIORES (en el SET de Postgres se leen así).
      const newCost = d.type === 'PERCENT'
        ? Prisma.sql`GREATEST(ROUND(p.cost * (1 + ${v}::numeric / 100), 2), 0)`
        : Prisma.sql`GREATEST(ROUND(p.cost + ${v}::numeric, 2), 0)`;
      let priceExpr: Prisma.Sql;
      let costExpr: Prisma.Sql = Prisma.sql`p.cost`;
      let eligibleCond: Prisma.Sql = Prisma.sql`TRUE`;
      if (d.target === 'PRICE') {
        priceExpr = d.type === 'PERCENT'
          ? Prisma.sql`GREATEST(p.price * (1 + ${v}::numeric / 100), 0)`
          : Prisma.sql`GREATEST(p.price + ${v}::numeric, 0)`;
      } else if (d.target === 'COST') {
        costExpr = newCost;
        priceExpr = d.keepMargin
          ? Prisma.sql`CASE WHEN p.cost > 0 THEN p.price * (${newCost}) / p.cost ELSE p.price END`
          : Prisma.sql`p.price`;
      } else {
        priceExpr = Prisma.sql`p.cost / (1 - ${v}::numeric / 100)`;
        eligibleCond = Prisma.sql`p.cost > 0`;
      }
      const rounded = d.rounding > 0
        ? Prisma.sql`ROUND((${priceExpr}) / ${d.rounding}::numeric) * ${d.rounding}::numeric`
        : Prisma.sql`ROUND(${priceExpr}, 2)`;

      const [{ selected, eligible }] = await prisma.$queryRaw<{ selected: number; eligible: number }[]>`
        SELECT COUNT(*)::int AS selected, COUNT(*) FILTER (WHERE ${eligibleCond})::int AS eligible
        FROM products p WHERE ${scope}
      `;
      if (eligible === 0) throw new AppError('Ninguno de los productos elegidos tiene costo cargado para calcular el margen', 400);

      const updated = await prisma.$executeRaw`
        UPDATE products p SET
          price = ${rounded},
          cost = ${costExpr},
          "priceUpdatedAt" = NOW(),
          "priceCtxSource" = 'PRICE_LIST_ADJUST', "priceCtxUserId" = ${userId}, "priceCtxRef" = ${ref},
          "updatedAt" = NOW()
        WHERE ${scope} AND ${eligibleCond}
      `;

      const label = d.target === 'MARGIN'
        ? `margen fijado en ${d.value} %`
        : `${d.target === 'PRICE' ? 'precio de venta' : 'costo'} ${d.value > 0 ? '+' : ''}${d.value}${d.type === 'PERCENT' ? ' %' : ' $'}${d.target === 'COST' && d.keepMargin ? ' (precio acompaña, margen constante)' : ''}`;
      container.resolve<IActivityLogRepository>('ActivityLogRepository').create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'Product',
        entityId: 'price-list-adjust',
        description: `Lista de precios: ${updated} producto(s) ajustados en pesos — ${label}`,
      }).catch(() => { /* log no crítico */ });

      res.json({ status: 'success', data: { updated, skipped: selected - updated, ref } });
    } catch (error) { next(error); }
  };

  /** Edición en línea de una celda: precio, costo o margen de un producto. */
  edit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const d = editSchema.parse(req.body);
      const userId = req.user?.userId ?? null;
      const ref = randomUUID();
      let set: Prisma.Sql;
      let cond: Prisma.Sql = Prisma.sql`TRUE`;
      if (d.price !== undefined) {
        set = Prisma.sql`price = ROUND(${new Prisma.Decimal(d.price)}::numeric, 2)`;
      } else if (d.cost !== undefined) {
        const c = new Prisma.Decimal(d.cost);
        set = d.keepMargin
          ? Prisma.sql`price = CASE WHEN cost > 0 THEN ROUND(price * ${c}::numeric / cost, 2) ELSE price END, cost = ROUND(${c}::numeric, 2)`
          : Prisma.sql`cost = ROUND(${c}::numeric, 2)`;
      } else {
        set = Prisma.sql`price = ROUND(cost / (1 - ${new Prisma.Decimal(d.margin!)}::numeric / 100), 2)`;
        cond = Prisma.sql`cost > 0`;
      }
      const rows = await prisma.$queryRaw<{ price: number; cost: number }[]>`
        UPDATE products SET ${set},
          "priceUpdatedAt" = NOW(),
          "priceCtxSource" = 'PRICE_LIST_EDIT', "priceCtxUserId" = ${userId}, "priceCtxRef" = ${ref},
          "updatedAt" = NOW()
        WHERE id = ${d.id} AND "companyId" = ${req.companyId!} AND ${cond}
        RETURNING price::float AS price, cost::float AS cost
      `;
      if (rows.length === 0) throw new AppError(d.margin !== undefined ? 'El producto no tiene costo cargado para calcular el margen' : 'Producto no encontrado', 400);
      res.json({ status: 'success', data: { ...rows[0], ref } });
    } catch (error) { next(error); }
  };

  /** Importación de lista del proveedor, paso 1: cruza códigos del archivo con SKU / código de barras. */
  importMatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { codes } = importMatchSchema.parse(req.body);
      const unique = [...new Set(codes.map((c) => c.toLowerCase()))];
      const rows = await prisma.$queryRaw<any[]>`
        SELECT p.id, p.sku, p.barcode, p.name, p."isActive",
               p.price::float AS price, p.cost::float AS cost, p."taxRate"::float AS "taxRate"
        FROM products p
        WHERE p."companyId" = ${req.companyId!}
          AND (lower(p.sku) IN (${Prisma.join(unique)}) OR lower(p.barcode) IN (${Prisma.join(unique)}))
      `;
      res.json({ status: 'success', data: rows });
    } catch (error) { next(error); }
  };

  /** Paso 2: aplica los costos nuevos; el precio acompaña (margen constante) y se redondea si se pidió. */
  importApply = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const d = importApplySchema.parse(req.body);
      const ref = randomUUID();
      const userId = req.user?.userId ?? null;
      const values = Prisma.join(d.items.map((i) => Prisma.sql`(${i.id}, ${new Prisma.Decimal(i.cost)}::numeric)`));
      const newCost = d.costIncludesTax
        ? Prisma.sql`ROUND(v.cost / (1 + p."taxRate" / 100), 2)`
        : Prisma.sql`ROUND(v.cost, 2)`;
      const rawPrice = d.keepMargin
        ? Prisma.sql`CASE WHEN p.cost > 0 THEN p.price * (${newCost}) / p.cost ELSE p.price END`
        : Prisma.sql`p.price`;
      const price = d.rounding > 0
        ? Prisma.sql`ROUND((${rawPrice}) / ${d.rounding}::numeric) * ${d.rounding}::numeric`
        : Prisma.sql`ROUND(${rawPrice}, 2)`;
      const updated = await prisma.$executeRaw`
        UPDATE products p SET
          price = ${price},
          cost = ${newCost},
          "priceUpdatedAt" = NOW(),
          "priceCtxSource" = 'PRICE_LIST_IMPORT', "priceCtxUserId" = ${userId}, "priceCtxRef" = ${ref},
          "updatedAt" = NOW()
        FROM (VALUES ${values}) AS v(id, cost)
        WHERE p.id = v.id AND p."companyId" = ${req.companyId!}
      `;
      container.resolve<IActivityLogRepository>('ActivityLogRepository').create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'Product',
        entityId: 'price-list-import',
        description: `Lista de precios: ${updated} costo(s) actualizados desde la lista de un proveedor${d.keepMargin ? ' (precio acompaña, margen constante)' : ''}`,
      }).catch(() => { /* log no crítico */ });
      res.json({ status: 'success', data: { updated, ref } });
    } catch (error) { next(error); }
  };
}
