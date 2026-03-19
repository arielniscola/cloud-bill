import { Request, Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';

export class DashboardController {
  async getStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const [
        ventasMesAgg,
        cobrosPendientesAgg,
        cobrosDelMesAgg,
        pagosMesRows,
        comprasMesAgg,
        comprasPendientesRows,
        ocPendientesRows,
        totalClientes,
        totalProductos,
        totalProveedores,
        facturasBorrador,
        remitosPendientesCount,
        recentInvoices,
        recentOrdenPagos,
        pendingRemitos,
        customersWithDebt,
        lowStockRaw,
      ] = await Promise.all([
        // Ventas del mes — solo facturas (no presupuestos)
        prisma.invoice.aggregate({
          _sum: { total: true },
          _count: true,
          where: {
            status: { in: ['ISSUED', 'PAID', 'PARTIALLY_PAID'] },
            currency: 'ARS',
            date: { gte: monthStart, lte: monthEnd },
          },
        }),

        // Cobros pendientes (facturas ISSUED + PARTIALLY_PAID)
        prisma.invoice.aggregate({
          _sum: { total: true },
          _count: true,
          where: {
            status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
            currency: 'ARS',
          },
        }),

        // Cobros del mes — recibos EMITIDOS (dinero efectivamente cobrado)
        prisma.recibo.aggregate({
          _sum: { amount: true },
          _count: true,
          where: {
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
            AND date >= ${monthStart} AND date <= ${monthEnd}
        `,

        // Compras del mes (no canceladas)
        prisma.purchase.aggregate({
          _sum: { total: true },
          _count: true,
          where: {
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
        `,

        // OC pendientes (no recibidas ni canceladas)
        prisma.$queryRaw<{ count: bigint; total: any }[]>`
          SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
          FROM "orden_compras"
          WHERE status NOT IN ('RECEIVED', 'CANCELLED')
        `,

        // Contadores
        prisma.customer.count({ where: { isActive: true } }),
        prisma.product.count({ where: { isActive: true } }),
        prisma.supplier.count({ where: { isActive: true } }),
        prisma.invoice.count({ where: { status: 'DRAFT' } }),

        // Remitos pendientes
        prisma.remito.count({
          where: { status: { in: ['PENDING', 'PARTIALLY_DELIVERED'] } },
        }),

        // Últimas 5 facturas
        prisma.invoice.findMany({
          take: 5,
          orderBy: { date: 'desc' },
          where: { status: { not: 'DRAFT' } },
          include: { customer: { select: { id: true, name: true } } },
        }),

        // Últimas 5 Órdenes de Pago
        prisma.$queryRaw<{ id: string; number: string; date: Date; amount: any; currency: string; status: string; supplierName: string | null }[]>`
          SELECT op.id, op.number, op.date, op.amount, op.currency, op.status,
                 s.name AS "supplierName"
          FROM "orden_pagos" op
          LEFT JOIN "suppliers" s ON s.id = op."supplierId"
          WHERE op.status = 'EMITTED'
          ORDER BY op."createdAt" DESC
          LIMIT 5
        `,

        // Remitos pendientes de entrega (detalle, top 5)
        prisma.remito.findMany({
          where: { status: { in: ['PENDING', 'PARTIALLY_DELIVERED'] } },
          take: 5,
          orderBy: { date: 'asc' },
          include: { customer: { select: { id: true, name: true } } },
        }),

        // Clientes con deuda (balance > 0, ARS)
        prisma.currentAccount.findMany({
          where: { balance: { gt: 0 }, currency: 'ARS' },
          include: { customer: { select: { id: true, name: true } } },
          orderBy: { balance: 'desc' },
          take: 5,
        }),

        // Stock bajo
        prisma.stock.findMany({
          where: { minQuantity: { not: null } },
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
            total: ventasMesAgg._sum.total?.toNumber() ?? 0,
            count: ventasMesAgg._count,
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
          facturasBorrador,
          totalClientes,
          totalProductos,
          totalProveedores,
          remitosPendientes: remitosPendientesCount,
          recentInvoices: recentInvoices.map((inv) => ({
            id: inv.id,
            number: inv.number,
            date: inv.date,
            type: inv.type,
            status: inv.status,
            total: inv.total.toNumber(),
            currency: inv.currency,
            customer: inv.customer,
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

  async getCharts(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const now = new Date();

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

      const [invoiceRows, purchaseRows, reciboRows, ordenPagoRows] = await Promise.all([
        // Ventas: solo facturas
        prisma.invoice.findMany({
          where: {
            status: { in: ['ISSUED', 'PARTIALLY_PAID', 'PAID'] },
            currency: 'ARS',
            date: { gte: months[0].start, lte: months[11].end },
          },
          select: { date: true, total: true },
        }),
        prisma.purchase.findMany({
          where: {
            status: { not: 'CANCELLED' },
            date: { gte: months[0].start, lte: months[11].end },
          },
          select: { date: true, total: true },
        }),
        prisma.recibo.findMany({
          where: {
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
            AND date >= ${months[0].start} AND date <= ${months[11].end}
        `,
      ]);

      const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

      const data = months.map(({ year, month, start, end }) => {
        const inRange = (d: Date) => d >= start && d <= end;

        const ventas = invoiceRows
          .filter((r) => inRange(new Date(r.date)))
          .reduce((acc, r) => acc + (r.total as Decimal).toNumber(), 0);

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
