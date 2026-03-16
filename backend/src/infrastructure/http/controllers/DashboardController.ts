import { Request, Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
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
        presupuestosMesAgg,
        comprasMesAgg,
        totalClientes,
        totalProductos,
        totalProveedores,
        facturasBorrador,
        remitosPendientesCount,
        recentInvoices,
        recentBudgets,
        pendingRemitos,
        customersWithDebt,
        lowStockRaw,
      ] = await Promise.all([
        // Ventas del mes (ISSUED + PAID + PARTIALLY_PAID, ARS)
        prisma.invoice.aggregate({
          _sum: { total: true },
          _count: true,
          where: {
            status: { in: ['ISSUED', 'PAID', 'PARTIALLY_PAID'] },
            currency: 'ARS',
            date: { gte: monthStart, lte: monthEnd },
          },
        }),

        // Cobros pendientes (ISSUED + PARTIALLY_PAID sin importar fecha, ARS)
        prisma.invoice.aggregate({
          _sum: { total: true },
          _count: true,
          where: {
            status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
            currency: 'ARS',
          },
        }),

        // Cobros del mes — recibos EMITIDOS en el mes (dinero efectivamente cobrado)
        prisma.recibo.aggregate({
          _sum: { amount: true },
          _count: true,
          where: {
            status: 'EMITTED',
            currency: 'ARS',
            date: { gte: monthStart, lte: monthEnd },
          },
        }),

        // Presupuestos del mes (excluye RECHAZADOS y VENCIDOS)
        prisma.budget.aggregate({
          _sum: { total: true },
          _count: true,
          where: {
            status: { notIn: ['REJECTED', 'EXPIRED'] },
            currency: 'ARS',
            date: { gte: monthStart, lte: monthEnd },
          },
        }),

        // Compras del mes (no canceladas)
        prisma.purchase.aggregate({
          _sum: { total: true },
          _count: true,
          where: {
            status: { not: 'CANCELLED' },
            date: { gte: monthStart, lte: monthEnd },
          },
        }),

        // Contadores
        prisma.customer.count({ where: { isActive: true } }),
        prisma.product.count({ where: { isActive: true } }),
        prisma.supplier.count({ where: { isActive: true } }),
        prisma.invoice.count({ where: { status: 'DRAFT' } }),

        // Remitos pendientes de entrega
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

        // Últimos 5 presupuestos
        prisma.budget.findMany({
          take: 5,
          orderBy: { date: 'desc' },
          include: { customer: { select: { id: true, name: true } } },
        }),

        // Remitos pendientes de entrega (detalle, top 5)
        prisma.remito.findMany({
          where: { status: { in: ['PENDING', 'PARTIALLY_DELIVERED'] } },
          take: 5,
          orderBy: { date: 'asc' },
          include: {
            customer: { select: { id: true, name: true } },
          },
        }),

        // Clientes con deuda (balance > 0, ARS)
        prisma.currentAccount.findMany({
          where: { balance: { gt: 0 }, currency: 'ARS' },
          include: { customer: { select: { id: true, name: true } } },
          orderBy: { balance: 'desc' },
          take: 5,
        }),

        // Stock con minQuantity configurado
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
          presupuestosMes: {
            total: presupuestosMesAgg._sum.total?.toNumber() ?? 0,
            count: presupuestosMesAgg._count,
          },
          comprasMes: {
            total: comprasMesAgg._sum.total?.toNumber() ?? 0,
            count: comprasMesAgg._count,
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
          recentBudgets: recentBudgets.map((b) => ({
            id: b.id,
            number: b.number,
            date: b.date,
            status: b.status,
            total: b.total.toNumber(),
            currency: b.currency,
            customer: b.customer,
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

      // Build 12 month buckets: oldest first
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

      // Fetch all relevant records once, then group in JS
      const [invoiceRows, purchaseRows, reciboRows] = await Promise.all([
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

        return {
          label: `${MONTH_LABELS[month]} ${year}`,
          shortLabel: MONTH_LABELS[month],
          year,
          month: month + 1,
          ventas: Math.round(ventas),
          compras: Math.round(compras),
          cobros: Math.round(cobros),
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
