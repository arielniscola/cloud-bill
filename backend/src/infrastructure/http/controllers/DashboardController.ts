import { Request, Response, NextFunction } from 'express';
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
}
