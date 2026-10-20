import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ICashRegisterRepository } from '../../../domain/repositories/ICashRegisterRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError } from '../../../shared/errors/AppError';
import { CASH_CONCEPT_LABELS } from '../../database/repositories/PrismaCashRegisterRepository';

export class CashRegisterController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const cashRegister = await repo.create({ ...req.body, companyId: req.companyId });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'CashRegister',
        entityId: cashRegister.id,
        description: `Caja ${cashRegister.name} creada`,
      });

      res.status(201).json({ status: 'success', data: cashRegister });
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const onlyActive = req.query.active === 'true';
      const cashRegisters = await repo.findAll(onlyActive, req.companyId);
      res.json({ status: 'success', data: cashRegisters });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const cashRegister = await repo.findById(req.params.id, req.companyId);
      if (!cashRegister) throw new NotFoundError('Caja');
      res.json({ status: 'success', data: cashRegister });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const existing = await repo.findById(req.params.id, req.companyId);
      if (!existing) throw new NotFoundError('Caja');
      const cashRegister = await repo.update(req.params.id, req.body);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'CashRegister',
        entityId: cashRegister.id,
        description: `Caja ${cashRegister.name} actualizada`,
      });

      res.json({ status: 'success', data: cashRegister });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const existing = await repo.findById(req.params.id, req.companyId);
      if (!existing) throw new NotFoundError('Caja');
      await repo.delete(req.params.id);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'DELETE',
        entity: 'CashRegister',
        entityId: req.params.id,
        description: `Caja ${existing.name} eliminada`,
      });

      res.json({ status: 'success', data: null });
    } catch (error) {
      next(error);
    }
  }

  async getMovements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const { id } = req.params;
      const { page, limit, type, startDate, endDate } = req.query;

      const cashRegister = await repo.findById(id);
      if (!cashRegister) throw new NotFoundError('Caja');

      const result = await repo.getMovements(
        id,
        {
          type: type as string,
          startDate: startDate as string,
          endDate: endDate as string,
          fiscalMode: req.fiscalMode,
        },
        { page: Number(page) || 1, limit: Number(limit) || 20 }
      );

      res.json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  }

  async getClosePreview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const cashRegister = await repo.findById(req.params.id, req.companyId);
      if (!cashRegister) throw new NotFoundError('Caja');

      const preview = await repo.getClosePreview(req.params.id, req.fiscalMode);
      res.json({ status: 'success', data: preview });
    } catch (error) {
      next(error);
    }
  }

  async createClose(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const cashRegister = await repo.findById(req.params.id, req.companyId);
      if (!cashRegister) throw new NotFoundError('Caja');

      const close = await repo.createClose(req.params.id, {
        notes: req.body.notes,
        userId: req.user?.userId,
      }, req.fiscalMode);

      res.status(201).json({ status: 'success', data: close });
    } catch (error) {
      next(error);
    }
  }

  async createCashMovement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const cashRegister = await repo.findById(req.params.id, req.companyId);
      if (!cashRegister) throw new NotFoundError('Caja');

      const movement = await repo.createCashMovement({
        companyId: req.companyId!,
        cashRegisterId: cashRegister.id,
        type: req.body.type,
        concept: req.body.concept,
        amount: req.body.amount,
        personName: req.body.personName,
        notes: req.body.notes,
        bankAccountId: req.body.bankAccountId,
        userId: req.user?.userId,
        fiscalMode: req.fiscalMode ?? 'FORMAL',
      });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'CashMovement',
        entityId: movement.id,
        description: `${CASH_CONCEPT_LABELS[movement.concept] ?? movement.concept} ${movement.number} en caja ${cashRegister.name} por $${Number(movement.amount).toFixed(2)}`,
      });

      res.status(201).json({ status: 'success', data: movement });
    } catch (error) {
      next(error);
    }
  }

  async getCashMovement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const movement = await repo.findCashMovement(req.params.movementId, req.params.id, req.companyId);
      if (!movement) throw new NotFoundError('Movimiento de caja');
      res.json({ status: 'success', data: movement });
    } catch (error) {
      next(error);
    }
  }

  async cancelCashMovement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const existing = await repo.findCashMovement(req.params.movementId, req.params.id, req.companyId);
      if (!existing) throw new NotFoundError('Movimiento de caja');

      const movement = await repo.cancelCashMovement(existing);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'CashMovement',
        entityId: movement.id,
        description: `Movimiento de caja ${movement.number} anulado`,
      });

      res.json({ status: 'success', data: movement });
    } catch (error) {
      next(error);
    }
  }

  async getCloses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const { id } = req.params;
      const { page, limit } = req.query;

      const cashRegister = await repo.findById(id);
      if (!cashRegister) throw new NotFoundError('Caja');

      const result = await repo.getCloses(id, {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
      });

      res.json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  }
}
