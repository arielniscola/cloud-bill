import { Request, Response, NextFunction } from 'express';
import prisma from '../../database/prisma';

export class SyncController {
  /**
   * GET /api/sync/export
   * Query params:
   *   since?: ISO date string — if provided, returns only records updated after this date (delta sync)
   *
   * Returns a full or delta snapshot of all company data.
   * The caller must be authenticated; companyId is taken from the JWT token.
   */
  async export(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId;
      if (!companyId) {
        res.status(403).json({ status: 'error', message: 'No companyId in token' });
        return;
      }

      const sinceParam = req.query.since as string | undefined;
      const since: Date | undefined = sinceParam ? new Date(sinceParam) : undefined;

      if (sinceParam && isNaN(since!.getTime())) {
        res.status(400).json({ status: 'error', message: 'Invalid "since" date format' });
        return;
      }

      const afterDate = since ? { gte: since } : undefined;

      const [
        companies,
        customers,
        products,
        productVariants,
        invoices,
        invoiceItems,
        budgets,
        budgetItems,
        purchases,
        purchaseItems,
        suppliers,
        warehouses,
        stocks,
        stockMovements,
        cashRegisters,
        currentAccounts,
        accountMovements,
        remitos,
        remitoItems,
        recibos,
        ordenPedidos,
        ordenPedidoItems,
        ordenCompras,
        ordenCompraItems,
        ordenPagos,
        ordenPagoItems,
        supplierAccountMovements,
        bankAccounts,
        bankMovements,
        users,
        rubros,
        categories,
        brands,
        cards,
        cardSurcharges,
        afipConfig,
        appSettings,
        activityLogs,
      ] = await Promise.all([
        // La empresa misma: sin esta fila el login local cae a plan 'PRO' y los
        // comprobantes quedan sin datos de cabecera.
        prisma.company.findMany({ where: { id: companyId } }),
        prisma.customer.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.product.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        // Variantes: FK desde stocks, invoice_items, remito_items y stock_movements.
        prisma.productVariant.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.invoice.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.invoiceItem.findMany({
          where: { invoice: { companyId, ...(afterDate && { updatedAt: afterDate }) } },
        }),
        prisma.budget.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.budgetItem.findMany({
          where: { budget: { companyId, ...(afterDate && { updatedAt: afterDate }) } },
        }),
        prisma.purchase.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.purchaseItem.findMany({
          where: { purchase: { companyId, ...(afterDate && { updatedAt: afterDate }) } },
        }),
        prisma.supplier.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.warehouse.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        // stocks have no updatedAt — always export all for the company
        prisma.stock.findMany({
          where: { warehouse: { companyId } },
        }),
        prisma.stockMovement.findMany({
          where: { warehouse: { companyId }, ...(afterDate && { createdAt: afterDate }) },
        }),
        prisma.cashRegister.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.currentAccount.findMany({
          where: { customer: { companyId }, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.accountMovement.findMany({
          where: {
            currentAccount: { customer: { companyId } },
            ...(afterDate && { createdAt: afterDate }),
          },
        }),
        prisma.remito.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.remitoItem.findMany({
          where: { remito: { companyId, ...(afterDate && { updatedAt: afterDate }) } },
        }),
        prisma.recibo.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.ordenPedido.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.ordenPedidoItem.findMany({
          where: { ordenPedido: { companyId, ...(afterDate && { updatedAt: afterDate }) } },
        }),
        prisma.ordenCompra.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.ordenCompraItem.findMany({
          where: { ordenCompra: { companyId, ...(afterDate && { updatedAt: afterDate }) } },
        }),
        prisma.ordenPago.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.ordenPagoItem.findMany({
          where: { ordenPago: { companyId, ...(afterDate && { updatedAt: afterDate }) } },
        }),
        prisma.supplierAccountMovement.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.bankAccount.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.bankMovement.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        // users — incluye el hash de la contraseña a propósito: sin él el INSERT
        // local viola el NOT NULL de users.password y, aun salvando eso, nadie
        // podría iniciar sesión en la instalación local. El endpoint ya exige un
        // ADMIN de la propia empresa y el hash es bcrypt, no la contraseña.
        prisma.user.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
          select: {
            id: true,
            username: true,
            email: true,
            password: true,
            name: true,
            role: true,
            isActive: true,
            companyId: true,
            dashboardShortcuts: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        // rubros (jerárquicos) / categories (planas) / brands — FK desde products
        prisma.rubro.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.category.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.brand.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        // cards + recargos — FK desde recibos
        prisma.card.findMany({
          where: { companyId, ...(afterDate && { updatedAt: afterDate }) },
        }),
        prisma.cardSurcharge.findMany({
          where: { card: { companyId }, ...(afterDate && { updatedAt: afterDate }) },
        }),
        // afip_config — scoped to the company (has companyId)
        prisma.afipConfig.findMany({
          where: { companyId },
        }),
        // app_settings — single global row (no companyId)
        prisma.appSettings.findMany(),
        // activity_logs — via user.companyId
        prisma.activityLog.findMany({
          where: {
            user: { companyId },
            ...(afterDate && { createdAt: afterDate }),
          },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

      res.json({
        status: 'ok',
        syncedAt: new Date().toISOString(),
        since: since?.toISOString() ?? null,
        companyId,
        data: {
          companies,
          customers,
          products,
          productVariants,
          invoices,
          invoiceItems,
          budgets,
          budgetItems,
          purchases,
          purchaseItems,
          suppliers,
          warehouses,
          stocks,
          stockMovements,
          cashRegisters,
          currentAccounts,
          accountMovements,
          remitos,
          remitoItems,
          recibos,
          ordenPedidos,
          ordenPedidoItems,
          ordenCompras,
          ordenCompraItems,
          ordenPagos,
          ordenPagoItems,
          supplierAccountMovements,
          bankAccounts,
          bankMovements,
          users,
          rubros,
          categories,
          brands,
          cards,
          cardSurcharges,
          afipConfig,
          appSettings,
          activityLogs,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/sync/status
   * Returns record counts per table without transferring data.
   * Useful for the installer to verify the local DB state matches the cloud.
   */
  async status(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId;
      if (!companyId) {
        res.status(403).json({ status: 'error', message: 'No companyId in token' });
        return;
      }

      const [
        customers,
        products,
        invoices,
        budgets,
        purchases,
        suppliers,
        warehouses,
        remitos,
        recibos,
        ordenPedidos,
        ordenCompras,
        ordenPagos,
        bankAccounts,
        users,
      ] = await Promise.all([
        prisma.customer.count({ where: { companyId } }),
        prisma.product.count({ where: { companyId } }),
        prisma.invoice.count({ where: { companyId } }),
        prisma.budget.count({ where: { companyId } }),
        prisma.purchase.count({ where: { companyId } }),
        prisma.supplier.count({ where: { companyId } }),
        prisma.warehouse.count({ where: { companyId } }),
        prisma.remito.count({ where: { companyId } }),
        prisma.recibo.count({ where: { companyId } }),
        prisma.ordenPedido.count({ where: { companyId } }),
        prisma.ordenCompra.count({ where: { companyId } }),
        prisma.ordenPago.count({ where: { companyId } }),
        prisma.bankAccount.count({ where: { companyId } }),
        prisma.user.count({ where: { companyId } }),
      ]);

      res.json({
        status: 'ok',
        checkedAt: new Date().toISOString(),
        companyId,
        counts: {
          customers,
          products,
          invoices,
          budgets,
          purchases,
          suppliers,
          warehouses,
          remitos,
          recibos,
          ordenPedidos,
          ordenCompras,
          ordenPagos,
          bankAccounts,
          users,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
