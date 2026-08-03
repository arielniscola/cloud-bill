import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';

export class DashboardController {
  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const now = new Date();
      const reqYear = parseInt(req.query.year as string);
      const reqMonth = parseInt(req.query.month as string); // 1-12
      const year = !isNaN(reqYear) ? reqYear : now.getFullYear();
      const month = !isNaN(reqMonth) && reqMonth >= 1 && reqMonth <= 12 ? reqMonth - 1 : now.getMonth(); // 0-indexed
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
      const companyId = req.companyId;
      const fiscalMode = req.fiscalMode;
      const fmFilter = fiscalMode ? Prisma.sql`AND "fiscalMode" = ${fiscalMode}` : Prisma.empty;

      const [
        ventasMesRows,
        cobrosPendientesRows,
        cobrosDelMesRows,
        pagosMesRows,
        comprasMesRows,
        comprasPendientesRows,
        ocPendientesRows,
        opPendientesRows,
        opConvertidasRows,
        totalClientes,
        totalProductos,
        totalProveedores,
        facturasBorradorRows,
        remitosPendientesRows,
        recentOrdenPedidos,
        recentOrdenPagos,
        pendingRemitosRaw,
        customersWithDebtRows,
        lowStockRaw,
      ] = await Promise.all([
        // Ventas del mes — facturas emitidas + órdenes de pedido NO convertidas.
        // Una OP convertida a factura ya se cuenta como su factura (invoiceId NOT NULL),
        // por eso se excluye acá para no duplicar la venta.
        prisma.$queryRaw<{ total: any; count: bigint }[]>`
          SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count FROM (
            SELECT total FROM "invoices"
            WHERE type IN ('FACTURA_A', 'FACTURA_B', 'FACTURA_C')
              AND status IN ('ISSUED', 'AUTHORIZED', 'PAID', 'PARTIALLY_PAID')
              AND currency = 'ARS'
              AND "companyId" = ${companyId}
              ${fmFilter}
              AND date >= ${monthStart} AND date <= ${monthEnd}
            UNION ALL
            SELECT total FROM "orden_pedidos"
            WHERE status IN ('CONFIRMED', 'PARTIALLY_PAID', 'PAID')
              AND "invoiceId" IS NULL
              AND currency = 'ARS'
              AND "companyId" = ${companyId}
              ${fmFilter}
              AND date >= ${monthStart} AND date <= ${monthEnd}
          ) AS ventas
        `,

        // Cobros pendientes (facturas ISSUED/AUTHORIZED + PARTIALLY_PAID)
        prisma.$queryRaw<{ total: any; count: bigint }[]>`
          SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
          FROM "invoices"
          WHERE status IN ('ISSUED', 'AUTHORIZED', 'PARTIALLY_PAID')
            AND currency = 'ARS'
            AND "companyId" = ${companyId}
            ${fmFilter}
        `,

        // Cobros del mes — recibos EMITIDOS (dinero efectivamente cobrado)
        prisma.$queryRaw<{ total: any; count: bigint }[]>`
          SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
          FROM "recibos"
          WHERE status = 'EMITTED'
            AND currency = 'ARS'
            AND "companyId" = ${companyId}
            ${fmFilter}
            AND date >= ${monthStart} AND date <= ${monthEnd}
        `,

        // Pagos del mes — Órdenes de Pago EMITIDAS este mes
        prisma.$queryRaw<{ total: any; count: bigint }[]>`
          SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
          FROM "orden_pagos"
          WHERE status = 'EMITTED'
            AND "companyId" = ${companyId}
            ${fmFilter}
            AND date >= ${monthStart} AND date <= ${monthEnd}
        `,

        // Compras del mes — facturas de compra (documento de primer nivel del flujo
        // actual). Solo FACTURA_* (excluye NC/ND), igual que la métrica de ventas.
        prisma.$queryRaw<{ total: any; count: bigint }[]>`
          SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
          FROM "purchase_invoices"
          WHERE type IN ('FACTURA_A', 'FACTURA_B', 'FACTURA_C')
            AND "companyId" = ${companyId}
            ${fmFilter}
            AND date >= ${monthStart} AND date <= ${monthEnd}
        `,

        // Compras pendientes de pago — facturas no pagadas totalmente.
        // El saldo pendiente = total − imputado por Órdenes de Pago pagadas.
        // Las NC (notas de crédito) no son un pasivo, se excluyen.
        prisma.$queryRaw<{ count: bigint; total: any }[]>`
          SELECT COUNT(*) AS count,
                 COALESCE(SUM(pi.amount - COALESCE((
                   SELECT SUM(
                     CASE WHEN op.currency = pi.currency THEN opi.amount ELSE opi.amount / NULLIF(op."exchangeRate", 0) END
                   )
                   FROM "orden_pago_items" opi
                   JOIN "orden_pagos" op ON op.id = opi."ordenPagoId"
                   WHERE opi."purchaseInvoiceId" = pi.id AND op.status = 'PAID'
                 ), 0)), 0) AS total
          FROM "purchase_invoices" pi
          WHERE pi.status != 'PAID'
            AND pi.type NOT IN ('NOTA_CREDITO_A', 'NOTA_CREDITO_B', 'NOTA_CREDITO_C')
            AND pi."companyId" = ${companyId}
            ${fmFilter}
        `,

        // OC pendientes (no recibidas ni canceladas)
        prisma.$queryRaw<{ count: bigint; total: any }[]>`
          SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
          FROM "orden_compras"
          WHERE status NOT IN ('RECEIVED', 'CANCELLED')
            AND "companyId" = ${companyId}
            ${fmFilter}
        `,

        // OP pendientes (CONFIRMED — no convertidas ni pagadas ni canceladas)
        prisma.$queryRaw<{ count: bigint; total: any }[]>`
          SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
          FROM "orden_pedidos"
          WHERE status = 'CONFIRMED'
            AND "companyId" = ${companyId}
            ${fmFilter}
        `,

        // OP convertidas a factura este mes
        prisma.$queryRaw<{ count: bigint; total: any }[]>`
          SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
          FROM "orden_pedidos"
          WHERE status = 'CONVERTED'
            AND "companyId" = ${companyId}
            ${fmFilter}
            AND date >= ${monthStart} AND date <= ${monthEnd}
        `,

        // Contadores
        prisma.customer.count({ where: { companyId, isActive: true } }),
        prisma.product.count({ where: { companyId, isActive: true } }),
        prisma.supplier.count({ where: { companyId, isActive: true } }),

        // Facturas borrador
        prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) AS count FROM "invoices"
          WHERE status = 'DRAFT' AND "companyId" = ${companyId} ${fmFilter}
        `,

        // Remitos pendientes
        prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) AS count FROM "remitos"
          WHERE status IN ('PENDING', 'PARTIALLY_DELIVERED')
            AND "companyId" = ${companyId}
            ${fmFilter}
        `,

        // Últimas 5 OP (no borrador)
        prisma.$queryRaw<{ id: string; number: string; date: Date; total: any; currency: string; status: string; invoiceId: string | null; customerName: string | null; invoiceNumber: string | null }[]>`
          SELECT op.id, op.number, op.date, op.total, op.currency, op.status,
                 op."invoiceId",
                 c.name AS "customerName",
                 inv.number AS "invoiceNumber"
          FROM "orden_pedidos" op
          LEFT JOIN "customers" c ON c.id = op."customerId"
          LEFT JOIN "invoices" inv ON inv.id = op."invoiceId"
          WHERE op.status != 'DRAFT'
            AND op."companyId" = ${companyId}
            AND op."fiscalMode" = ${fiscalMode}
          ORDER BY op."createdAt" DESC
          LIMIT 5
        `,

        // Últimas 5 Órdenes de Pago
        prisma.$queryRaw<{ id: string; number: string; date: Date; amount: any; currency: string; status: string; supplierName: string | null }[]>`
          SELECT op.id, op.number, op.date, op.amount, op.currency, op.status,
                 s.name AS "supplierName"
          FROM "orden_pagos" op
          LEFT JOIN "suppliers" s ON s.id = op."supplierId"
          WHERE op.status = 'EMITTED'
            AND op."companyId" = ${companyId}
            AND op."fiscalMode" = ${fiscalMode}
          ORDER BY op."createdAt" DESC
          LIMIT 5
        `,

        // Remitos pendientes de entrega (detalle, top 5)
        prisma.$queryRaw<{ id: string; number: string; date: Date; status: string; customerId: string; customerName: string }[]>`
          SELECT r.id, r.number, r.date, r.status,
                 r."customerId", c.name AS "customerName"
          FROM "remitos" r
          LEFT JOIN "customers" c ON c.id = r."customerId"
          WHERE r.status IN ('PENDING', 'PARTIALLY_DELIVERED')
            AND r."companyId" = ${companyId}
            AND r."fiscalMode" = ${fiscalMode}
          ORDER BY r.date ASC
          LIMIT 5
        `,

        // Clientes con deuda (balance > 0, ARS, filtrado por fiscalMode)
        prisma.$queryRaw<{ id: string; balance: any; currency: string; customerId: string; customerName: string }[]>`
          SELECT ca.id, ca.balance, ca.currency,
                 ca."customerId", c.name AS "customerName"
          FROM "current_accounts" ca
          JOIN "customers" c ON c.id = ca."customerId"
          WHERE ca.balance > 0
            AND ca.currency = 'ARS'
            AND c."companyId" = ${companyId}
            AND ca."fiscalMode" = ${fiscalMode}
          ORDER BY ca.balance DESC
          LIMIT 5
        `,

        // Stock bajo
        prisma.stock.findMany({
          where: {
            minQuantity: { not: null },
            warehouse: { companyId },
          },
          include: {
            product: { select: { id: true, name: true, sku: true } },
            warehouse: { select: { id: true, name: true } },
          },
        }),
      ]);

      // Filtrar stock por debajo del mínimo
      const lowStockItems = lowStockRaw
        .filter((s) => s.minQuantity !== null && s.quantity.lessThan(s.minQuantity))
        .slice(0, 5);

      const r = (rows: { total?: any; count?: bigint }[]) => ({
        total: Number(rows[0]?.total ?? 0),
        count: Number(rows[0]?.count ?? 0),
      });

      res.json({
        status: 'success',
        data: {
          ventasMes: r(ventasMesRows),
          cobrosPendientes: r(cobrosPendientesRows),
          cobrosDelMes: r(cobrosDelMesRows),
          pagosMes: r(pagosMesRows),
          comprasMes: r(comprasMesRows),
          comprasPendientesPago: r(comprasPendientesRows),
          ocPendientes: r(ocPendientesRows),
          opPendientes: r(opPendientesRows),
          opConvertidas: r(opConvertidasRows),
          facturasBorrador: Number(facturasBorradorRows[0]?.count ?? 0),
          totalClientes,
          totalProductos,
          totalProveedores,
          remitosPendientes: Number(remitosPendientesRows[0]?.count ?? 0),
          recentOrdenPedidos: recentOrdenPedidos.map((op) => ({
            id: op.id,
            number: op.number,
            date: op.date,
            status: op.status,
            total: Number(op.total),
            currency: op.currency,
            invoiceId: op.invoiceId,
            invoiceNumber: op.invoiceNumber,
            customer: { name: op.customerName ?? '—' },
          })),
          recentOrdenPagos: recentOrdenPagos.map((op) => ({
            id: op.id,
            number: op.number,
            date: op.date,
            amount: Number(op.amount),
            currency: op.currency,
            status: op.status,
            supplier: { name: op.supplierName ?? '—' },
          })),
          pendingRemitos: pendingRemitosRaw.map((r) => ({
            id: r.id,
            number: r.number,
            date: r.date,
            status: r.status,
            customer: { id: r.customerId, name: r.customerName ?? '—' },
          })),
          customersWithDebt: customersWithDebtRows.map((ca) => ({
            id: ca.id,
            balance: Number(ca.balance),
            currency: ca.currency,
            customer: { id: ca.customerId, name: ca.customerName ?? '—' },
          })),
          lowStockItems: lowStockItems.map((s) => ({
            id: s.id,
            quantity: s.quantity.toNumber(),
            minQuantity: s.minQuantity?.toNumber() ?? 0,
            product: s.product,
            warehouse: s.warehouse,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getCharts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const now = new Date();
      const companyId = req.companyId;
      const fiscalMode = req.fiscalMode;
      const fmFilter = fiscalMode ? Prisma.sql`AND "fiscalMode" = ${fiscalMode}` : Prisma.empty;

      const months: { year: number; month: number; start: Date; end: Date }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = d.getMonth();
        months.push({
          year,
          month,
          start: new Date(year, month, 1),
          end: new Date(year, month + 1, 0, 23, 59, 59, 999),
        });
      }

      const [invoiceRows, ordenPedidoVentaRows, purchaseRows, reciboRows, ordenPagoRows] = await Promise.all([
        // Ventas: facturas emitidas (no NC/ND)
        prisma.$queryRaw<{ date: Date; total: any }[]>`
          SELECT date, total FROM "invoices"
          WHERE type IN ('FACTURA_A', 'FACTURA_B', 'FACTURA_C')
            AND status IN ('ISSUED', 'AUTHORIZED', 'PAID', 'PARTIALLY_PAID')
            AND currency = 'ARS'
            AND "companyId" = ${companyId}
            ${fmFilter}
            AND date >= ${months[0].start} AND date <= ${months[11].end}
        `,
        // Ventas: órdenes de pedido NO convertidas (las convertidas cuentan como su factura)
        prisma.$queryRaw<{ date: Date; total: any }[]>`
          SELECT date, total FROM "orden_pedidos"
          WHERE status IN ('CONFIRMED', 'PARTIALLY_PAID', 'PAID')
            AND "invoiceId" IS NULL
            AND currency = 'ARS'
            AND "companyId" = ${companyId}
            ${fmFilter}
            AND date >= ${months[0].start} AND date <= ${months[11].end}
        `,
        // Compras — facturas de compra (documento de primer nivel del flujo actual).
        // Solo FACTURA_* (excluye NC/ND), consistente con la serie de ventas.
        prisma.$queryRaw<{ date: Date; total: any }[]>`
          SELECT date, amount AS total FROM "purchase_invoices"
          WHERE type IN ('FACTURA_A', 'FACTURA_B', 'FACTURA_C')
            AND "companyId" = ${companyId}
            ${fmFilter}
            AND date >= ${months[0].start} AND date <= ${months[11].end}
        `,
        // Cobros (recibos)
        prisma.$queryRaw<{ date: Date; amount: any }[]>`
          SELECT date, amount FROM "recibos"
          WHERE status = 'EMITTED'
            AND currency = 'ARS'
            AND "companyId" = ${companyId}
            ${fmFilter}
            AND date >= ${months[0].start} AND date <= ${months[11].end}
        `,
        // Pagos a proveedores (Órdenes de Pago) — neto de retenciones: lo
        // retenido no sale de caja, queda como impuesto a depositar.
        prisma.$queryRaw<{ date: Date; amount: any }[]>`
          SELECT date, (amount - "retentionAmount") AS amount FROM "orden_pagos"
          WHERE status = 'EMITTED'
            AND "companyId" = ${companyId}
            ${fmFilter}
            AND date >= ${months[0].start} AND date <= ${months[11].end}
        `,
      ]);

      const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

      const data = months.map(({ year, month, start, end }) => {
        const inRange = (d: Date) => d >= start && d <= end;

        const ventas = [...invoiceRows, ...ordenPedidoVentaRows]
          .filter((r) => inRange(new Date(r.date)))
          .reduce((acc, r) => acc + Number(r.total), 0);

        const compras = purchaseRows
          .filter((r) => inRange(new Date(r.date)))
          .reduce((acc, r) => acc + Number(r.total), 0);

        const cobros = reciboRows
          .filter((r) => inRange(new Date(r.date)))
          .reduce((acc, r) => acc + Number(r.amount), 0);

        const pagos = ordenPagoRows
          .filter((r) => inRange(new Date(r.date)))
          .reduce((acc, r) => acc + Number(r.amount), 0);

        return {
          label: `${MONTH_LABELS[month]} ${year}`,
          shortLabel: MONTH_LABELS[month],
          year,
          month: month + 1,
          ventas: Math.round(ventas),
          compras: Math.round(compras),
          cobros: Math.round(cobros),
          pagos: Math.round(pagos),
          ganancia: Math.round(ventas - compras),
          margen: ventas > 0 ? Math.round(((ventas - compras) / ventas) * 100) : 0,
        };
      });

      res.json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }
}
