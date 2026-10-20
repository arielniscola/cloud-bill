import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';
import { NotFoundError } from '../../../shared/errors/AppError';
import { lotsDeliveredByReference } from '../../database/repositories/stockLots';

const OUT_TYPES = Prisma.sql`('SALE','ADJUSTMENT_OUT','TRANSFER_OUT','REMITO_OUT')`;

/** Lotes y vencimientos: stock por lote, trazabilidad y lotes de cada comprobante. */
export class StockLotController {
  /**
   * GET /stock/lots — lotes de la empresa.
   * Filtros: productId, variantId, warehouseId, search (producto o lote),
   * expiry = expired | 30 | 60 | 90 (vencidos o que vencen dentro de N días),
   * withStock = 'false' para incluir lotes agotados.
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as Record<string, string | undefined>;
      const conds: Prisma.Sql[] = [Prisma.sql`p."companyId" = ${req.companyId}`];
      if (q.productId) conds.push(Prisma.sql`l."productId" = ${q.productId}`);
      if (q.variantId) conds.push(Prisma.sql`l."variantId" = ${q.variantId}`);
      if (q.warehouseId) conds.push(Prisma.sql`l."warehouseId" = ${q.warehouseId}`);
      if (q.withStock !== 'false') conds.push(Prisma.sql`l.quantity > 0`);
      if (q.search) {
        const like = `%${q.search}%`;
        conds.push(Prisma.sql`(p.name ILIKE ${like} OR p.sku ILIKE ${like} OR l."lotNumber" ILIKE ${like})`);
      }
      if (q.expiry === 'expired') {
        conds.push(Prisma.sql`l."expiresAt" < CURRENT_DATE`);
      } else if (q.expiry && /^\d+$/.test(q.expiry)) {
        conds.push(Prisma.sql`l."expiresAt" >= CURRENT_DATE AND l."expiresAt" <= CURRENT_DATE + ${Number(q.expiry)}::int`);
      }

      const rows = await prisma.$queryRaw<any[]>`
        SELECT l.id, l."productId", l."variantId", l."warehouseId", l."lotNumber", l."expiresAt",
               l.quantity::float8 AS quantity, l."createdAt",
               p.sku AS "productSku", p.name AS "productName", p.unit AS "productUnit",
               v.name AS "variantName", w.name AS "warehouseName",
               (l."expiresAt" - CURRENT_DATE) AS "daysToExpiry"
        FROM "stock_lots" l
        JOIN "products" p ON p.id = l."productId"
        JOIN "warehouses" w ON w.id = l."warehouseId"
        LEFT JOIN "product_variants" v ON v.id = l."variantId"
        WHERE ${Prisma.join(conds, ' AND ')}
        ORDER BY l."expiresAt" ASC NULLS LAST, p.name ASC, l."lotNumber" ASC
        LIMIT 1000
      `;

      res.json({
        status: 'success',
        data: rows.map((r) => ({
          ...r,
          expiresAt: r.expiresAt ? (r.expiresAt as Date).toISOString().slice(0, 10) : null,
          daysToExpiry: r.daysToExpiry === null ? null : Number(r.daysToExpiry),
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  /** GET /stock/lots/:id/trace — cada movimiento del lote con su comprobante y cliente/proveedor. */
  async trace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lots = await prisma.$queryRaw<any[]>`
        SELECT l.id, l."lotNumber", l."expiresAt", l.quantity::float8 AS quantity,
               p.id AS "productId", p.name AS "productName", p.sku AS "productSku", w.name AS "warehouseName"
        FROM "stock_lots" l
        JOIN "products" p ON p.id = l."productId"
        JOIN "warehouses" w ON w.id = l."warehouseId"
        WHERE l.id = ${req.params.id} AND p."companyId" = ${req.companyId}
        LIMIT 1
      `;
      if (!lots[0]) throw new NotFoundError('Lote');

      const movements = await prisma.$queryRaw<any[]>`
        SELECT m.id, m.type::text AS type, m."createdAt", m.reason, m."referenceId",
               sml.quantity::float8 AS quantity,
               (m.type::text IN ${OUT_TYPES}) AS outgoing,
               COALESCE(i.number, r.number, op.number, pr.number) AS "documentNumber",
               CASE WHEN i.id IS NOT NULL THEN 'INVOICE'
                    WHEN r.id IS NOT NULL THEN 'REMITO'
                    WHEN op.id IS NOT NULL THEN 'ORDEN_PEDIDO'
                    WHEN pr.id IS NOT NULL THEN 'PURCHASE_REMITO'
               END AS "documentType",
               COALESCE(ci.name, cr.name, cop.name) AS "customerName",
               COALESCE(ci.id, cr.id, cop.id) AS "customerId",
               s.name AS "supplierName"
        FROM "stock_movement_lots" sml
        JOIN "stock_movements" m ON m.id = sml."movementId"
        LEFT JOIN "invoices" i ON i.id = m."referenceId"
        LEFT JOIN "customers" ci ON ci.id = i."customerId"
        LEFT JOIN "remitos" r ON r.id = m."referenceId"
        LEFT JOIN "customers" cr ON cr.id = r."customerId"
        LEFT JOIN "orden_pedidos" op ON op.id = m."referenceId"
        LEFT JOIN "customers" cop ON cop.id = op."customerId"
        LEFT JOIN "purchase_remitos" pr ON pr.id = m."referenceId"
        LEFT JOIN "suppliers" s ON s.id = pr."supplierId"
        WHERE sml."lotId" = ${req.params.id}
        ORDER BY m."createdAt" ASC
      `;

      const lot = lots[0];
      res.json({
        status: 'success',
        data: {
          ...lot,
          expiresAt: lot.expiresAt ? (lot.expiresAt as Date).toISOString().slice(0, 10) : null,
          movements,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /stock/lots/by-reference?ids=a,b — lotes entregados por esos comprobantes
   * (neto: lo que salió menos lo que volvió), por producto/variante. Para el
   * detalle y la impresión de remitos, facturas y órdenes de pedido.
   */
  async byReference(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ids = String(req.query.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
      if (ids.length === 0) { res.json({ status: 'success', data: [] }); return; }

      // Solo comprobantes de la empresa.
      const owned = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "invoices" WHERE id IN (${Prisma.join(ids)}) AND "companyId" = ${req.companyId}
        UNION SELECT id FROM "remitos" WHERE id IN (${Prisma.join(ids)}) AND "companyId" = ${req.companyId}
        UNION SELECT id FROM "orden_pedidos" WHERE id IN (${Prisma.join(ids)}) AND "companyId" = ${req.companyId}
        UNION SELECT id FROM "purchase_remitos" WHERE id IN (${Prisma.join(ids)}) AND "companyId" = ${req.companyId}
      `;
      const data = await lotsDeliveredByReference(prisma, owned.map((o) => o.id));
      res.json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }
}
