import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IPurchaseRepository } from '../../../domain/repositories/IPurchaseRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';

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

      const purchase = await repo.create({
        type: req.body.type,
        number: req.body.number,
        supplierId: req.body.supplierId,
        userId: req.user!.userId,
        date: req.body.date ? new Date(req.body.date) : undefined,
        currency: req.body.currency,
        notes: req.body.notes,
        items: req.body.items,
      });

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'Purchase',
        entityId: purchase.id,
        description: `Compra ${purchase.number} registrada`,
      });

      res.status(201).json({ status: 'success', data: purchase });
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
