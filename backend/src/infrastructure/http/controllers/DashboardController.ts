import { Request, Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
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

      const [
        ventasMesRows,
        cobrosPendientesAgg,
        cobrosDelMesAgg,
        pagosMesRows,
        comprasMesAgg,
        comprasPendientesRows,
        ocPendientesRows,
        opPendientesRows,
        opConvertidasRows,
        totalClientes,
        totalProductos,
        totalProveedores,
        facturasBorrador,
        remitosPendientesCount,
        recentOrdenPedidos,
        recentOrdenPagos,
        pendingRemitos,
        customersWithDebt,
        lowStockRaw,
      ] = await Promise.all([
        // Ventas del mes — basado en OP (no canceladas ni borrador)
        prisma.$queryRaw<{ total: any; count: bigint }[]>`
          SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
          FROM "orden_pedidos"
          WHERE status NOT IN ('DRAFT', 'CANCELLED')
            AND currency = 'ARS'
            AND "companyId" = ${companyId}
            AND date >= ${monthStart} AND date <= ${monthEnd}
        `,

        // Cobros pendientes (facturas ISSUED + PARTIALLY_PAID)
        prisma.invoice.aggregate({
          _sum: { total: true },
          _count: true,
          where: {
            companyId,
            status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
            currency: 'ARS',
          },
        }),

        // Cobros del mes — recibos EMITIDOS (dinero efectivamente cobrado)
        prisma.recibo.aggregate({
          _sum: { amount: true },
          _count: true,
          where: {
            companyId,
            status: 'EMITTED',
            currency: 'ARS',
            date: { gte: monthStart, lte: monthEnd },
          },
        }),

        // Pagos del mes — Órdenes de Pago EMITIDAS este mes
        prisma.$queryRaw<{ total: any; count: bigint }[]>`
          SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
          FROM "orden_pagos"
          WHERE status = 'EMITTED'
            AND "companyId" = ${companyId}
            AND date >= ${monthStart} AND date <= ${monthEnd}
        `,

        // Compras del mes (no canceladas)
        prisma.purchase.aggregate({
          _sum: { total: true },
          _count: true,
          where: {
            companyId,
            status: { not: 'CANCELLED' },
            date: { gte: monthStart, lte: monthEnd },
          },
        }),

        // Compras pendientes de pago (no pagadas totalmente)
        prisma.$queryRaw<{ count: bigint; total: any }[]>`
          SELECT COUNT(*) AS count,
                 COALESCE(SUM(total - "paidAmount"), 0) AS total
          FROM "purchases"
          WHERE "paymentStatus" != 'PAID'
            AND status != 'CANCELLED'
            AND "companyId" = ${companyId}
        `,

        // OC pendientes (no recibidas ni canceladas)
        prisma.$queryRaw<{ count: bigint; total: any }[]>`
          SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
          FROM "orden_compras"
          WHERE status NOT IN ('RECEIVED', 'CANCELLED')
            AND "companyId" = ${companyId}
        `,

        // OP pendientes (CONFIRMED — no convertidas ni pagadas ni canceladas)
        prisma.$queryRaw<{ count: bigint; total: any }[]>`
          SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
          FROM "orden_pedidos"
          WHERE status = 'CONFIRMED'
            AND "companyId" = ${companyId}
        `,

        // OP convertidas a factura este mes
        prisma.$queryRaw<{ count: bigint; total: any }[]>`
          SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
          FROM "orden_pedidos"
          WHERE status = 'CONVERTED'
            AND "companyId" = ${companyId}
            AND date >= ${monthStart} AND date <= ${monthEnd}
        `,

        // Contadores
        prisma.customer.count({ where: { companyId, isActive: true } }),
        prisma.product.count({ where: { companyId, isActive: true } }),
        prisma.supplier.count({ where: { companyId, isActive: true } }),
        prisma.invoice.count({ where: { companyId, status: 'DRAFT' } }),

        // Remitos pendientes
        prisma.remito.count({
          where: { companyId, status: { in: ['PENDING', 'PARTIALLY_DELIVERED'] } },
        }),

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
          ORDER BY op."createdAt" DESC
          LIMIT 5
        `,

        // Remitos pendientes de entrega (detalle, top 5)
        prisma.remito.findMany({
          where: { companyId, status: { in: ['PENDING', 'PARTIALLY_DELIVERED'] } },
          take: 5,
          orderBy: { date: 'asc' },
          include: { customer: { select: { id: true, name: true } } },
        }),

        // Clientes con deuda (balance > 0, ARS)
        prisma.currentAccount.findMany({
          where: {
            balance: { gt: 0 },
            currency: 'ARS',
            customer: { companyId },
          },
          include: { customer: { select: { id: true, name: true } } },
          orderBy: { balance: 'desc' },
          take: 5,
        }),

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

      res.json({
        status: 'success',
        data: {
          ventasMes: {
            total: Number(ventasMesRows[0]?.total ?? 0),
            count: Number(ventasMesRows[0]?.count ?? 0),
          },
          cobrosPendientes: {
            total: cobrosPendientesAgg._sum.total?.toNumber() ?? 0,
            count: cobrosPendientesAgg._count,
          },
          cobrosDelMes: {
            total: cobrosDelMesAgg._sum.amount?.toNumber() ?? 0,
            count: cobrosDelMesAgg._count,
          },
          pagosMes: {
            total: Number(pagosMesRows[0]?.total ?? 0),
            count: Number(pagosMesRows[0]?.count ?? 0),
          },
          comprasMes: {
            total: comprasMesAgg._sum.total?.toNumber() ?? 0,
            count: comprasMesAgg._count,
          },
          comprasPendientesPago: {
            total: Number(comprasPendientesRows[0]?.total ?? 0),
            count: Number(comprasPendientesRows[0]?.count ?? 0),
          },
          ocPendientes: {
            total: Number(ocPendientesRows[0]?.total ?? 0),
            count: Number(ocPendientesRows[0]?.count ?? 0),
          },
          opPendientes: {
            total: Number(opPendientesRows[0]?.total ?? 0),
            count: Number(opPendientesRows[0]?.count ?? 0),
          },
          opConvertidas: {
            total: Number(opConvertidasRows[0]?.total ?? 0),
            count: Number(opConvertidasRows[0]?.count ?? 0),
          },
          facturasBorrador,
          totalClientes,
          totalProductos,
          totalProveedores,
          remitosPendientes: remitosPendientesCount,
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
          pendingRemitos: pendingRemitos.map((r) => ({
            id: r.id,
            number: r.number,
            date: r.date,
            status: r.status,
            customer: r.customer,
          })),
          customersWithDebt: customersWithDebt.map((ca) => ({
            id: ca.id,
            balance: ca.balance.toNumber(),
            currency: ca.currency,
            customer: ca.customer,
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

      const [opRows, purchaseRows, reciboRows, ordenPagoRows] = await Promise.all([
        // Ventas: basado en OP (no borrador ni canceladas)
        prisma.$queryRaw<{ date: Date; total: any }[]>`
          SELECT date, total FROM "orden_pedidos"
          WHERE status NOT IN ('DRAFT', 'CANCELLED')
            AND currency = 'ARS'
            AND "companyId" = ${companyId}
            AND date >= ${months[0].start} AND date <= ${months[11].end}
        `,
        prisma.purchase.findMany({
          where: {
            companyId,
            status: { not: 'CANCELLED' },
            date: { gte: months[0].start, lte: months[11].end },
          },
          select: { date: true, total: true },
        }),
        prisma.recibo.findMany({
          where: {
            companyId,
            status: 'EMITTED',
            currency: 'ARS',
            date: { gte: months[0].start, lte: months[11].end },
          },
          select: { date: true, amount: true },
        }),
        // Pagos a proveedores (Órdenes de Pago)
        prisma.$queryRaw<{ date: Date; amount: any }[]>`
          SELECT date, amount FROM "orden_pagos"
          WHERE status = 'EMITTED'
            AND "companyId" = ${companyId}
            AND date >= ${months[0].start} AND date <= ${months[11].end}
        `,
      ]);

      const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

      const data = months.map(({ year, month, start, end }) => {
        const inRange = (d: Date) => d >= start && d <= end;

        const ventas = opRows
          .filter((r) => inRange(new Date(r.date)))
          .reduce((acc, r) => acc + Number(r.total), 0);

        const compras = purchaseRows
          .filter((r) => inRange(new Date(r.date)))
          .reduce((acc, r) => acc + (r.total as Decimal).toNumber(), 0);

        const cobros = reciboRows
          .filter((r) => inRange(new Date(r.date)))
          .reduce((acc, r) => acc + (r.amount as Decimal).toNumber(), 0);

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
