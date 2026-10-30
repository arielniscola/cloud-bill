import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';
import { NotFoundError } from '../../../shared/errors/AppError';
import { arsFactorSql } from '../../../shared/utils/money';

// A pesos con la cotización del comprobante (en ARS siempre 1).
const fxSql = arsFactorSql;

/**
 * GET /products/:id/overview — todo lo que hace falta para la ficha del
 * producto en una sola respuesta: stock por depósito, últimos movimientos,
 * últimas compras (proveedor y costo), ventas de los últimos 12 meses por mes y
 * clientes que más lo compran.
 *
 * Ventas = facturas emitidas (NC restan) + órdenes de pedido no convertidas,
 * el mismo criterio que el Dashboard y el reporte de ventas; importes netos de
 * IVA y en pesos con la cotización de cada comprobante.
 */
export class ProductOverviewController {
  async overview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const productId = req.params.id;
      const [product] = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM products WHERE id = ${productId} AND "companyId" = ${companyId}`;
      if (!product) throw new NotFoundError('Producto');

      const fiscal = req.fiscalMode ?? null;
      const invFiscal = fiscal ? Prisma.sql`AND i."fiscalMode" = ${fiscal}` : Prisma.empty;
      const opFiscal  = fiscal ? Prisma.sql`AND op."fiscalMode" = ${fiscal}` : Prisma.empty;
      const since = new Date();
      since.setMonth(since.getMonth() - 11, 1);
      since.setHours(0, 0, 0, 0);

      // Líneas vendidas del producto en los últimos 12 meses (factura + OP sin convertir).
      const salesLines = Prisma.sql`
        SELECT i.date, i."customerId",
               (CASE WHEN i.type::text LIKE 'NOTA_CREDITO%' THEN -1 ELSE 1 END) * ii.quantity AS qty,
               (CASE WHEN i.type::text LIKE 'NOTA_CREDITO%' THEN -1 ELSE 1 END) * ii.subtotal * ${fxSql('i')} AS net
        FROM invoice_items ii
        JOIN invoices i ON i.id = ii."invoiceId"
        WHERE ii."productId" = ${productId} AND i."companyId" = ${companyId}
          AND i.status::text NOT IN ('CANCELLED', 'DRAFT') AND i.date >= ${since} ${invFiscal}
        UNION ALL
        SELECT op.date, op."customerId", opi.quantity AS qty, opi.subtotal * ${fxSql('op')} AS net
        FROM orden_pedido_items opi
        JOIN orden_pedidos op ON op.id = opi."ordenPedidoId"
        WHERE opi."productId" = ${productId} AND op."companyId" = ${companyId}
          AND op.status::text IN ('CONFIRMED', 'PARTIALLY_PAID', 'PAID') AND op."invoiceId" IS NULL
          AND op.date >= ${since} ${opFiscal}
      `;

      const [stock, movements, purchases, monthly, topCustomers, lastSale] = await Promise.all([
        prisma.$queryRaw<any[]>`
          SELECT w.id AS "warehouseId", w.name AS "warehouseName",
                 SUM(s.quantity)::float AS quantity, SUM(s."reservedQuantity")::float AS reserved,
                 MAX(s."minQuantity")::float AS "minQuantity"
          FROM stocks s JOIN warehouses w ON w.id = s."warehouseId"
          WHERE s."productId" = ${productId} AND w."companyId" = ${companyId}
          GROUP BY w.id, w.name, w."isDefault"
          ORDER BY w."isDefault" DESC, w.name`,

        prisma.$queryRaw<any[]>`
          SELECT sm.id, sm."createdAt", sm.type::text AS type, sm.quantity::float AS quantity,
                 sm."newQuantity"::float AS "newQuantity", sm.reason, sm."referenceId",
                 w.name AS "warehouseName", u.name AS "userName"
          FROM stock_movements sm
          JOIN warehouses w ON w.id = sm."warehouseId" AND w."companyId" = ${companyId}
          LEFT JOIN users u ON u.id = sm."userId"
          WHERE sm."productId" = ${productId}
          ORDER BY sm."createdAt" DESC
          LIMIT 15`,

        // Facturas de compra con el producto en la línea + remitos de compra
        // que no estén ya representados por una de esas facturas.
        prisma.$queryRaw<any[]>`
          SELECT * FROM (
            SELECT 'INVOICE' AS kind, pi.id, pi.number, pi.date, s.id AS "supplierId", s.name AS "supplierName",
                   ii.quantity::float AS quantity,
                   (ii.subtotal / NULLIF(ii.quantity, 0) * (1 - pi."discountPct" / 100))::float AS "unitCost",
                   pi.currency, pi."exchangeRate"::float AS "exchangeRate"
            FROM purchase_invoice_items ii
            JOIN purchase_invoices pi ON pi.id = ii."purchaseInvoiceId"
            LEFT JOIN suppliers s ON s.id = pi."supplierId"
            WHERE ii."productId" = ${productId} AND pi."companyId" = ${companyId} AND pi.type NOT LIKE 'NOTA_%'
            UNION ALL
            SELECT 'REMITO', r.id, r.number, r.date, s.id, s.name,
                   COALESCE(ri."receivedQuantity", ri.quantity)::float, NULLIF(ri."unitPrice", 0)::float, 'ARS', 1
            FROM purchase_remito_items ri
            JOIN purchase_remitos r ON r.id = ri."remitoId"
            LEFT JOIN suppliers s ON s.id = r."supplierId"
            WHERE ri."productId" = ${productId} AND r."companyId" = ${companyId}
              AND r.status NOT IN ('CANCELLED', 'REJECTED')
              AND NOT EXISTS (
                SELECT 1 FROM purchase_invoice_remitos pir
                JOIN purchase_invoice_items ii2 ON ii2."purchaseInvoiceId" = pir."purchaseInvoiceId" AND ii2."productId" = ri."productId"
                WHERE pir."remitoId" = r.id)
          ) x
          ORDER BY date DESC
          LIMIT 10`,

        prisma.$queryRaw<{ month: string; quantity: number; net: number }[]>`
          SELECT to_char(date_trunc('month', l.date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM') AS month,
                 SUM(l.qty)::float AS quantity, SUM(l.net)::float AS net
          FROM (${salesLines}) l
          GROUP BY 1 ORDER BY 1`,

        prisma.$queryRaw<any[]>`
          SELECT c.id, c.name, SUM(l.qty)::float AS quantity, SUM(l.net)::float AS net
          FROM (${salesLines}) l
          JOIN customers c ON c.id = l."customerId"
          GROUP BY c.id, c.name
          HAVING SUM(l.net) > 0
          ORDER BY SUM(l.net) DESC
          LIMIT 5`,

        // Última venta sin límite de fecha (puede ser anterior a los 12 meses).
        prisma.$queryRaw<{ date: Date | null }[]>`
          SELECT MAX(d) AS date FROM (
            SELECT MAX(i.date) AS d FROM invoice_items ii JOIN invoices i ON i.id = ii."invoiceId"
            WHERE ii."productId" = ${productId} AND i."companyId" = ${companyId}
              AND i.status::text NOT IN ('CANCELLED', 'DRAFT') AND i.type::text NOT LIKE 'NOTA_CREDITO%' ${invFiscal}
            UNION ALL
            SELECT MAX(op.date) FROM orden_pedido_items opi JOIN orden_pedidos op ON op.id = opi."ordenPedidoId"
            WHERE opi."productId" = ${productId} AND op."companyId" = ${companyId}
              AND op.status::text IN ('CONFIRMED', 'PARTIALLY_PAID', 'PAID') AND op."invoiceId" IS NULL ${opFiscal}
          ) t`,
      ]);

      // Los 12 meses completos, con cero donde no hubo ventas.
      const byMonth = new Map(monthly.map((m) => [m.month, m]));
      const months: { month: string; quantity: number; net: number }[] = [];
      const d = new Date(since);
      for (let i = 0; i < 12; i++) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months.push({ month: key, quantity: byMonth.get(key)?.quantity ?? 0, net: byMonth.get(key)?.net ?? 0 });
        d.setMonth(d.getMonth() + 1);
      }
      const units = months.reduce((a, m) => a + m.quantity, 0);
      const net = months.reduce((a, m) => a + m.net, 0);

      res.json({
        status: 'success',
        data: {
          stock,
          movements,
          purchases,
          sales: {
            months,
            units,
            net,
            avgUnitPrice: units > 0 ? net / units : null,
            lastSaleDate: lastSale[0]?.date ?? null,
            topCustomers,
          },
        },
      });
    } catch (error) { next(error); }
  }
}
