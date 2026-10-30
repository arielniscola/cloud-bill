import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';
import { NotFoundError } from '../../../shared/errors/AppError';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';

/**
 * Historial de precios y costos (tabla raw product_price_history, la escribe
 * un trigger de products — ver migración 20261029130000). Las operaciones
 * masivas comparten `ref` y se pueden deshacer enteras.
 */

// Columnas de cambio comunes a todas las consultas.
const changeCols = Prisma.sql`
  h."oldCost"::float AS "oldCost", h."newCost"::float AS "newCost",
  h."oldPrice"::float AS "oldPrice", h."newPrice"::float AS "newPrice",
  h."oldCostUSD"::float AS "oldCostUSD", h."newCostUSD"::float AS "newCostUSD",
  h."oldSalePriceUSD"::float AS "oldSalePriceUSD", h."newSalePriceUSD"::float AS "newSalePriceUSD"`;

export class ProductPriceHistoryController {
  /** GET /products/:id/price-history — cambios de un producto, el más nuevo primero. */
  async byProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [product] = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM products WHERE id = ${req.params.id} AND "companyId" = ${req.companyId!}`;
      if (!product) throw new NotFoundError('Producto');

      const rows = await prisma.$queryRaw<any[]>`
        SELECT h.id, h.source, h.ref, h."createdAt", u.name AS "userName",
               pi.number AS "invoiceNumber", ${changeCols}
        FROM product_price_history h
        LEFT JOIN users u ON u.id = h."userId"
        LEFT JOIN purchase_invoices pi ON h.source = 'PURCHASE_INVOICE' AND pi.id = h.ref
        WHERE h."productId" = ${req.params.id}
        ORDER BY h."createdAt" DESC
        LIMIT 300
      `;
      res.json({ status: 'success', data: rows });
    } catch (error) { next(error); }
  }

  /**
   * GET /products/price-history/operations — operaciones que cambiaron precios
   * de varios productos a la vez (masiva, importación, recálculo USD, factura
   * de compra, deshacer). Las ediciones sueltas no tienen `ref` y no aparecen.
   */
  async operations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page  = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const offset = (page - 1) * limit;
      const companyId = req.companyId!;

      const rows = await prisma.$queryRaw<any[]>`
        SELECT h.ref, MIN(h.source) AS source, MIN(h."createdAt") AS "createdAt",
               MIN(u.name) AS "userName", MIN(pi.number) AS "invoiceNumber",
               COUNT(DISTINCT h."productId")::int AS products,
               COUNT(DISTINCT h."productId") FILTER (WHERE h."oldPrice" IS NULL AND h."oldCost" IS NULL)::int AS created,
               AVG(CASE WHEN h."oldPrice" > 0 AND h."newPrice" IS DISTINCT FROM h."oldPrice"
                        THEN (h."newPrice" - h."oldPrice") / h."oldPrice" * 100 END)::float AS "avgPricePct",
               AVG(CASE WHEN h."oldCost" > 0 AND h."newCost" IS DISTINCT FROM h."oldCost"
                        THEN (h."newCost" - h."oldCost") / h."oldCost" * 100 END)::float AS "avgCostPct",
               EXISTS (SELECT 1 FROM product_price_history r
                       WHERE r."companyId" = ${companyId} AND r.ref = 'revert:' || h.ref) AS reverted
        FROM product_price_history h
        LEFT JOIN users u ON u.id = h."userId"
        LEFT JOIN purchase_invoices pi ON h.source = 'PURCHASE_INVOICE' AND pi.id = h.ref
        WHERE h."companyId" = ${companyId} AND h.ref IS NOT NULL
        GROUP BY h.ref
        ORDER BY MIN(h."createdAt") DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const [{ total }] = await prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(DISTINCT ref)::int AS total FROM product_price_history
        WHERE "companyId" = ${companyId} AND ref IS NOT NULL`;

      res.json({ status: 'success', data: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error) { next(error); }
  }

  /** GET /products/price-history/operations/:ref — productos de una operación (para revisar antes de deshacer). */
  async operationDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT h.id, h."productId", p.name, p.sku, h.source, h."createdAt", ${changeCols},
               (p.cost IS NOT DISTINCT FROM h."newCost" AND p.price IS NOT DISTINCT FROM h."newPrice"
                AND p."costUSD" IS NOT DISTINCT FROM h."newCostUSD"
                AND p."salePriceUSD" IS NOT DISTINCT FROM h."newSalePriceUSD") AS "isCurrent"
        FROM product_price_history h
        JOIN products p ON p.id = h."productId"
        WHERE h."companyId" = ${req.companyId!} AND h.ref = ${req.params.ref}
        ORDER BY p.name
        LIMIT 5000
      `;
      if (rows.length === 0) throw new NotFoundError('Operación');
      res.json({ status: 'success', data: rows });
    } catch (error) { next(error); }
  }

  /**
   * POST /products/price-history/operations/:ref/revert
   * Vuelve cada producto de la operación a los valores que tenía ANTES, salvo
   * que se haya vuelto a cambiar después (no se pisa un cambio posterior) o
   * que lo haya creado la operación (alta: no hay valor anterior). El deshacer
   * queda en el historial como una operación más (ref = 'revert:<ref>').
   */
  async revert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const ref = req.params.ref;
      const revertRef = `revert:${ref}`;

      const [stats] = await prisma.$queryRaw<{ products: number; created: number }[]>`
        SELECT COUNT(DISTINCT "productId")::int AS products,
               COUNT(DISTINCT "productId") FILTER (WHERE "oldPrice" IS NULL AND "oldCost" IS NULL)::int AS created
        FROM product_price_history WHERE "companyId" = ${companyId} AND ref = ${ref}`;
      if (!stats || stats.products === 0) throw new NotFoundError('Operación');

      // Por producto: los valores de ANTES del primer cambio de la operación y
      // los de DESPUÉS del último (un producto puede tener más de una fila).
      const reverted = await prisma.$executeRaw`
        WITH b AS (
          SELECT "productId",
                 (array_agg("oldCost"         ORDER BY "createdAt" ASC))[1]  AS "oldCost",
                 (array_agg("oldPrice"        ORDER BY "createdAt" ASC))[1]  AS "oldPrice",
                 (array_agg("oldCostUSD"      ORDER BY "createdAt" ASC))[1]  AS "oldCostUSD",
                 (array_agg("oldSalePriceUSD" ORDER BY "createdAt" ASC))[1]  AS "oldSalePriceUSD",
                 (array_agg("newCost"         ORDER BY "createdAt" DESC))[1] AS "newCost",
                 (array_agg("newPrice"        ORDER BY "createdAt" DESC))[1] AS "newPrice",
                 (array_agg("newCostUSD"      ORDER BY "createdAt" DESC))[1] AS "newCostUSD",
                 (array_agg("newSalePriceUSD" ORDER BY "createdAt" DESC))[1] AS "newSalePriceUSD"
          FROM product_price_history
          WHERE "companyId" = ${companyId} AND ref = ${ref}
          GROUP BY "productId"
        )
        UPDATE products p SET
          cost = b."oldCost", price = b."oldPrice",
          "costUSD" = b."oldCostUSD", "salePriceUSD" = b."oldSalePriceUSD",
          "priceUpdatedAt" = NOW(), "updatedAt" = NOW(),
          "priceCtxSource" = 'REVERT', "priceCtxUserId" = ${req.user?.userId ?? null}, "priceCtxRef" = ${revertRef}
        FROM b
        WHERE p.id = b."productId" AND p."companyId" = ${companyId}
          AND b."oldCost" IS NOT NULL AND b."oldPrice" IS NOT NULL
          AND p.cost           IS NOT DISTINCT FROM b."newCost"
          AND p.price          IS NOT DISTINCT FROM b."newPrice"
          AND p."costUSD"      IS NOT DISTINCT FROM b."newCostUSD"
          AND p."salePriceUSD" IS NOT DISTINCT FROM b."newSalePriceUSD"
      `;
      const changedSince = stats.products - stats.created - reverted;

      container.resolve<IActivityLogRepository>('ActivityLogRepository').create({
        userId: req.user!.userId, companyId, action: 'UPDATE', entity: 'Product', entityId: ref,
        description: `Deshacer cambio de precios: ${reverted} producto(s) vueltos al valor anterior`
          + (changedSince > 0 ? `; ${changedSince} sin tocar porque cambiaron después` : ''),
        metadata: { ref, reverted, changedSince, created: stats.created },
      }).catch(() => { /* log no crítico */ });

      res.json({ status: 'success', data: { reverted, changedSince, created: stats.created } });
    } catch (error) { next(error); }
  }
}
