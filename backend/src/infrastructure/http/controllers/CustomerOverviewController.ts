import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';
import { NotFoundError } from '../../../shared/errors/AppError';
import { arsFactorSql } from '../../../shared/utils/money';
import { bucketizeAging, customerAgingRows } from '../../../shared/helpers/aging';
import { exchangeRateService } from '../../services/ExchangeRateService';

/**
 * GET /customers/:id/overview — resumen de la ficha del cliente:
 *   · deuda: saldo de cuenta corriente por moneda, antigüedad de lo impago
 *     (en pesos con la cotización del DÍA, como deudores y aging) y demora
 *     promedio de pago;
 *   · ventas de los últimos 12 meses por mes, ticket promedio, última compra y
 *     los productos que más compra (en pesos con la cotización de cada
 *     comprobante, netos de IVA — mismo criterio que el reporte de ventas:
 *     facturas emitidas con NC restando + órdenes de pedido no convertidas).
 */
export class CustomerOverviewController {
  async overview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const customerId = req.params.id;
      const [customer] = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM customers WHERE id = ${customerId} AND "companyId" = ${companyId}`;
      if (!customer) throw new NotFoundError('Cliente');

      const fiscal = req.fiscalMode ?? null;
      const invFiscal = fiscal ? Prisma.sql`AND i."fiscalMode" = ${fiscal}` : Prisma.empty;
      const opFiscal  = fiscal ? Prisma.sql`AND op."fiscalMode" = ${fiscal}` : Prisma.empty;
      const since = new Date();
      since.setMonth(since.getMonth() - 11, 1);
      since.setHours(0, 0, 0, 0);
      const since365 = new Date(Date.now() - 365 * 86400000);

      // Comprobantes de venta del cliente (cabecera) de los últimos 12 meses.
      const docs = Prisma.sql`
        SELECT i.date, (CASE WHEN i.type::text LIKE 'NOTA_CREDITO%' THEN -1 ELSE 1 END) * i.subtotal * ${arsFactorSql('i')} AS net,
               (CASE WHEN i.type::text LIKE 'NOTA_CREDITO%' THEN 0 ELSE 1 END) AS counts
        FROM invoices i
        WHERE i."customerId" = ${customerId} AND i."companyId" = ${companyId}
          AND i.status::text NOT IN ('CANCELLED', 'DRAFT') AND i.date >= ${since} ${invFiscal}
        UNION ALL
        SELECT op.date, op.subtotal * ${arsFactorSql('op')}, 1
        FROM orden_pedidos op
        WHERE op."customerId" = ${customerId} AND op."companyId" = ${companyId}
          AND op.status::text IN ('CONFIRMED', 'PARTIALLY_PAID', 'PAID') AND op."invoiceId" IS NULL
          AND op.date >= ${since} ${opFiscal}
      `;
      // Líneas, para "qué compra".
      const lines = Prisma.sql`
        SELECT ii."productId", i.date,
               (CASE WHEN i.type::text LIKE 'NOTA_CREDITO%' THEN -1 ELSE 1 END) * ii.quantity AS qty,
               (CASE WHEN i.type::text LIKE 'NOTA_CREDITO%' THEN -1 ELSE 1 END) * ii.subtotal * ${arsFactorSql('i')} AS net
        FROM invoice_items ii JOIN invoices i ON i.id = ii."invoiceId"
        WHERE i."customerId" = ${customerId} AND i."companyId" = ${companyId}
          AND i.status::text NOT IN ('CANCELLED', 'DRAFT') AND i.date >= ${since} ${invFiscal}
        UNION ALL
        SELECT opi."productId", op.date, opi.quantity, opi.subtotal * ${arsFactorSql('op')}
        FROM orden_pedido_items opi JOIN orden_pedidos op ON op.id = opi."ordenPedidoId"
        WHERE op."customerId" = ${customerId} AND op."companyId" = ${companyId} AND opi."productId" IS NOT NULL
          AND op.status::text IN ('CONFIRMED', 'PARTIALLY_PAID', 'PAID') AND op."invoiceId" IS NULL
          AND op.date >= ${since} ${opFiscal}
      `;

      const [balances, agingRows, rateInfo, delay, monthly, topProducts, lastSale] = await Promise.all([
        prisma.$queryRaw<{ currency: string; balance: number; creditLimit: number | null }[]>`
          SELECT ca.currency::text AS currency, SUM(ca.balance)::float AS balance, MAX(ca."creditLimit")::float AS "creditLimit"
          FROM current_accounts ca
          WHERE ca."customerId" = ${customerId}
            AND (${fiscal}::text IS NULL OR ca."fiscalMode" = ${fiscal})
          GROUP BY ca.currency
          ORDER BY ca.currency`,
        customerAgingRows(companyId, fiscal ?? undefined, customerId),
        exchangeRateService.getUsdRate().catch(() => null),
        // Demora promedio: días entre el vencimiento de la factura y el cobro.
        prisma.$queryRaw<{ days: number | null }[]>`
          SELECT AVG(GREATEST(0, DATE_PART('day', r.date - COALESCE(i."dueDate", i.date))))::float8 AS days
          FROM recibos r JOIN invoices i ON i.id = r."invoiceId"
          WHERE r."companyId" = ${companyId} AND r."customerId" = ${customerId}
            AND (${fiscal}::text IS NULL OR r."fiscalMode" = ${fiscal})
            AND r.status = 'EMITTED' AND r.date >= ${since365}`,
        prisma.$queryRaw<{ month: string; net: number; docs: number }[]>`
          SELECT to_char(date_trunc('month', d.date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM') AS month,
                 SUM(d.net)::float AS net, SUM(d.counts)::int AS docs
          FROM (${docs}) d GROUP BY 1 ORDER BY 1`,
        prisma.$queryRaw<any[]>`
          SELECT p.id, p.name, p.sku, SUM(l.qty)::float AS quantity, SUM(l.net)::float AS net, MAX(l.date) AS "lastDate"
          FROM (${lines}) l JOIN products p ON p.id = l."productId"
          GROUP BY p.id, p.name, p.sku
          HAVING SUM(l.net) > 0
          ORDER BY SUM(l.net) DESC
          LIMIT 10`,
        prisma.$queryRaw<{ date: Date | null }[]>`
          SELECT MAX(d) AS date FROM (
            SELECT MAX(i.date) AS d FROM invoices i
            WHERE i."customerId" = ${customerId} AND i."companyId" = ${companyId}
              AND i.status::text NOT IN ('CANCELLED', 'DRAFT') AND i.type::text NOT LIKE 'NOTA_CREDITO%' ${invFiscal}
            UNION ALL
            SELECT MAX(op.date) FROM orden_pedidos op
            WHERE op."customerId" = ${customerId} AND op."companyId" = ${companyId}
              AND op.status::text IN ('CONFIRMED', 'PARTIALLY_PAID', 'PAID') AND op."invoiceId" IS NULL ${opFiscal}
          ) t`,
      ]);

      const aging = bucketizeAging(agingRows, rateInfo?.rate ?? null).find((a) => a.entityId === customerId) ?? null;

      const byMonth = new Map(monthly.map((m) => [m.month, m]));
      const months: { month: string; net: number; docs: number }[] = [];
      const d = new Date(since);
      for (let i = 0; i < 12; i++) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months.push({ month: key, net: byMonth.get(key)?.net ?? 0, docs: byMonth.get(key)?.docs ?? 0 });
        d.setMonth(d.getMonth() + 1);
      }
      const net = months.reduce((a, m) => a + m.net, 0);
      const docCount = months.reduce((a, m) => a + m.docs, 0);
      const avgDays = delay[0]?.days;

      res.json({
        status: 'success',
        data: {
          debt: {
            balances,
            aging,
            exchangeRate: rateInfo?.rate ?? null,
            avgPaymentDelayDays: avgDays == null ? null : Math.round(Number(avgDays)),
          },
          sales: {
            months,
            net,
            docCount,
            avgTicket: docCount > 0 ? net / docCount : null,
            lastSaleDate: lastSale[0]?.date ?? null,
            daysSinceLastSale: lastSale[0]?.date
              ? Math.max(0, Math.floor((Date.now() - new Date(lastSale[0].date).getTime()) / 86400000))
              : null,
            topProducts,
          },
        },
      });
    } catch (error) { next(error); }
  }
}
