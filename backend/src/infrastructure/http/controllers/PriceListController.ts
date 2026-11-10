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
  sort: z.enum(['name', 'sku', 'price', 'cost', 'margin']).default('name'),
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
                 s.name AS "supplierName", c.name AS "categoryName"
          FROM products p
          LEFT JOIN suppliers s ON s.id = p."supplierId"
          LEFT JOIN categories c ON c.id = p."categoryId"
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
}
