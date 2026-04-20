import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IPurchaseRepository } from '../../../domain/repositories/IPurchaseRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { IStockRepository } from '../../../domain/repositories/IWarehouseRepository';
import { IOrdenPagoRepository } from '../../../domain/repositories/IOrdenPagoRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import prisma from '../../database/prisma';
import { recordPurchaseCreated } from '../../services/AccountingService';

export class PurchaseController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IPurchaseRepository>('PurchaseRepository');
      const { page, limit, supplierId, status, dateFrom, dateTo } = req.query;

      const result = await repo.findAll(
        { page: Number(page) || 1, limit: Number(limit) || 20 },
        {
          supplierId: supplierId as string | undefined,
          status: status as 'REGISTERED' | 'CANCELLED' | undefined,
          companyId: req.companyId,
          fiscalMode: req.fiscalMode,
          dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
          dateTo: dateTo ? new Date(dateTo as string) : undefined,
        }
      );

      res.json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IPurchaseRepository>('PurchaseRepository');
      const purchase = await repo.findById(req.params.id);
      if (!purchase) throw new NotFoundError('Purchase');
      res.json({ status: 'success', data: purchase });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IPurchaseRepository>('PurchaseRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      const stockRepo = container.resolve<IStockRepository>('StockRepository');

      const saleCondition: string = req.body.saleCondition ?? 'CONTADO';

      // Auto-generate purchase number if not provided
      const year = new Date().getFullYear();
      const count = await prisma.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*) AS c FROM "purchases"
        WHERE "companyId" = ${req.companyId} AND number LIKE ${'COMP-' + year + '-%'}
      `;
      const autoNumber = `COMP-${year}-${String(Number((count[0]?.c ?? 0n)) + 1).padStart(4, '0')}`;

      const purchase = await repo.create({
        type: 'FACTURA_A',         // internal default — not shown in UI
        number: autoNumber,
        supplierId: req.body.supplierId,
        userId: req.user!.userId,
        companyId: req.companyId,
        warehouseId: req.body.warehouseId || undefined,
        date: req.body.date ? new Date(req.body.date) : undefined,
        currency: req.body.currency,
        notes: req.body.notes,
        items: req.body.items,
      });

      // Persist saleCondition + fiscalMode via raw SQL (stale Prisma client workaround)
      const fiscalMode = req.fiscalMode ?? 'FORMAL';
      await prisma.$executeRaw`
        UPDATE "purchases" SET "saleCondition" = ${saleCondition}, "fiscalMode" = ${fiscalMode} WHERE id = ${purchase.id}
      `;

      // If Cuenta Corriente: create DEBIT supplier account movement
      if (saleCondition === 'CUENTA_CORRIENTE') {
        const opRepo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
        await opRepo.createSupplierMovement({
          supplierId: purchase.supplierId,
          purchaseId: purchase.id,
          type: 'DEBIT',
          amount: Number(purchase.total),
          currency: purchase.currency,
          description: `Compra en CC: ${purchase.number}`,
          companyId: req.companyId,
          fiscalMode: fiscalMode as 'FORMAL' | 'INFORMAL',
        });
      }

      // Auto-stock: create PURCHASE movements for items linked to products
      if (purchase.warehouseId) {
        const itemsWithProduct = purchase.items.filter((i) => i.productId);
        for (const item of itemsWithProduct) {
          try {
            await stockRepo.addMovement({
              productId: item.productId!,
              warehouseId: purchase.warehouseId,
              type: 'PURCHASE',
              quantity: Number(item.quantity),
              reason: `Compra ${purchase.number}`,
              referenceId: purchase.id,
              userId: req.user!.userId,
            });
          } catch (stockError) {
            // Log stock error but don't fail the purchase creation
            console.error(`Stock movement failed for product ${item.productId}:`, stockError);
          }
        }
      }

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'Purchase',
        entityId: purchase.id,
        description: `Compra ${purchase.number} registrada`,
      });

      // Auto-generate journal entry
      await recordPurchaseCreated({
        id: purchase.id,
        number: purchase.number,
        subtotal: Number(purchase.subtotal),
        taxAmount: Number(purchase.taxAmount),
        total: Number(purchase.total),
        companyId: req.companyId,
        userId: req.user!.userId,
      });

      res.status(201).json({ status: 'success', data: purchase });
    } catch (error) {
      next(error);
    }
  }

  async getPendingInvoices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { supplierId } = req.query;
      if (!supplierId) throw new AppError('supplierId es requerido', 400);

      const rows = await prisma.$queryRaw<{
        id: string; number: string; type: string; amount: any; subtotal: any;
        taxRate: any; taxAmount: any; dueDate: Date | null; paymentMethod: string;
        purchaseId: string; purchaseNumber: string; purchaseDate: Date; currency: string;
      }[]>`
        SELECT pi.id, pi.number, pi.type, pi.amount, pi.subtotal, pi."taxRate", pi."taxAmount",
               pi."dueDate", pi."paymentMethod",
               p.id AS "purchaseId", p.number AS "purchaseNumber", p.date AS "purchaseDate", p.currency
        FROM "purchase_invoices" pi
        JOIN "purchases" p ON p.id = pi."purchaseId"
        WHERE p."supplierId" = ${supplierId as string}
          AND p."companyId" = ${req.companyId}
          AND p.status = 'REGISTERED'
          AND pi.status = 'PENDING'
        ORDER BY pi."createdAt" ASC
      `;

      res.json({ status: 'success', data: rows });
    } catch (error) {
      next(error);
    }
  }

  async assignWarehouse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo      = container.resolve<IPurchaseRepository>('PurchaseRepository');
      const stockRepo = container.resolve<IStockRepository>('StockRepository');

      const purchase = await repo.findById(req.params.id);
      if (!purchase) throw new NotFoundError('Purchase');
      if (purchase.warehouseId) throw new AppError('Esta compra ya tiene un almacén asignado', 400);

      const { warehouseId } = req.body;
      if (!warehouseId) throw new AppError('warehouseId es requerido', 400);

      const updated = await repo.update(req.params.id, { warehouseId });

      // Create PURCHASE stock movements for items linked to products
      const itemsWithProduct = purchase.items.filter((i) => i.productId);
      for (const item of itemsWithProduct) {
        try {
          await stockRepo.addMovement({
            productId: item.productId!,
            warehouseId,
            type: 'PURCHASE',
            quantity: Number(item.quantity),
            reason: `Compra ${purchase.number} (almacén asignado)`,
            referenceId: purchase.id,
            userId: req.user!.userId,
          });
        } catch (stockError) {
          console.error(`Stock movement failed for product ${item.productId}:`, stockError);
        }
      }

      res.json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IPurchaseRepository>('PurchaseRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const purchase = await repo.findById(req.params.id);
      if (!purchase) throw new NotFoundError('Purchase');

      if (purchase.status === 'CANCELLED') {
        throw new AppError('La compra ya está cancelada', 400);
      }

      const updated = await repo.update(req.params.id, { status: 'CANCELLED' });

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CANCEL',
        entity: 'Purchase',
        entityId: purchase.id,
        description: `Compra ${purchase.number} cancelada`,
      });

      res.json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }
}
