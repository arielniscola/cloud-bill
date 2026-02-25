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
        facturasBorrador,
        totalClientes,
        totalProductos,
        totalProveedores,
        comprasMesAgg,
        recentInvoices,
        customersWithDebt,
        lowStockRaw,
      ] = await Promise.all([
        // Ventas del mes (ISSUED + PAID, ARS)
        prisma.invoice.aggregate({
          _sum: { total: true },
          _count: true,
          where: {
            status: { in: ['ISSUED', 'PAID'] },
            currency: 'ARS',
            date: { gte: monthStart, lte: monthEnd },
          },
        }),
        // Cobros pendientes (solo ISSUED, ARS)
        prisma.invoice.aggregate({
          _sum: { total: true },
          _count: true,
          where: {
            status: 'ISSUED',
            currency: 'ARS',
          },
        }),
        // Facturas borrador
        prisma.invoice.count({ where: { status: 'DRAFT' } }),
        // Clientes activos
        prisma.customer.count({ where: { isActive: true } }),
        // Productos activos
        prisma.product.count({ where: { isActive: true } }),
        // Proveedores activos
        prisma.supplier.count({ where: { isActive: true } }),
        // Compras del mes (no canceladas)
        prisma.purchase.aggregate({
          _sum: { total: true },
          _count: true,
          where: {
            status: { not: 'CANCELLED' },
            date: { gte: monthStart, lte: monthEnd },
          },
        }),
        // Últimas 5 facturas con cliente
        prisma.invoice.findMany({
          take: 5,
          orderBy: { date: 'desc' },
          include: { customer: { select: { id: true, name: true } } },
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

      // Filtrar solo los que están por debajo del mínimo
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
          facturasBorrador,
          totalClientes,
          totalProductos,
          totalProveedores,
          comprasMes: {
            total: comprasMesAgg._sum.total?.toNumber() ?? 0,
            count: comprasMesAgg._count,
          },
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
