import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IRecurringInvoiceRepository } from '../../../domain/repositories/IRecurringInvoiceRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { recurringInvoiceService } from '../../services/RecurringInvoiceService';
import {
  createRecurringInvoiceSchema,
  updateRecurringInvoiceSchema,
  recurringInvoiceQuerySchema,
} from '../../../application/dtos/recurringInvoice.dto';

export class RecurringInvoiceController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IRecurringInvoiceRepository>('RecurringInvoiceRepository');
      const query = recurringInvoiceQuerySchema.parse(req.query);
      const result = await repo.findAll(
        { page: query.page, limit: query.limit },
        {
          companyId: req.companyId,
          customerId: query.customerId,
          isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
        }
      );
      res.json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IRecurringInvoiceRepository>('RecurringInvoiceRepository');
      const rec = await repo.findById(req.params.id, req.companyId);
      if (!rec) throw new NotFoundError('Abono');
      res.json({ status: 'success', data: rec });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IRecurringInvoiceRepository>('RecurringInvoiceRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      const data = createRecurringInvoiceSchema.parse(req.body);

      const startDate = new Date(data.startDate);
      const endDate = data.endDate ? new Date(data.endDate) : null;
      if (endDate && endDate < startDate) {
        throw new AppError('La fecha de fin no puede ser anterior a la de inicio', 400);
      }

      const rec = await repo.create({
        ...data,
        startDate,
        endDate,
        // La primera corrida es la fecha de inicio; el generador la toma
        // apenas venza (si ya pasó, en la próxima pasada del scheduler).
        nextRunAt: startDate,
        userId: req.user!.userId,
        companyId: req.companyId,
        fiscalMode: req.fiscalMode,
      });

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'RecurringInvoice',
        entityId: rec.id,
        description: `Abono "${rec.name}" creado (${rec.frequency})`,
      });

      res.status(201).json({ status: 'success', data: rec });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IRecurringInvoiceRepository>('RecurringInvoiceRepository');
      const existing = await repo.findById(req.params.id, req.companyId);
      if (!existing) throw new NotFoundError('Abono');

      const data = updateRecurringInvoiceSchema.parse(req.body);
      const patch: any = { ...data };
      if (data.startDate !== undefined) {
        patch.startDate = new Date(data.startDate);
        // Si corren la fecha de inicio hacia adelante, la próxima corrida se realinea.
        if (patch.startDate > existing.nextRunAt) patch.nextRunAt = patch.startDate;
      }
      if (data.endDate !== undefined) patch.endDate = data.endDate ? new Date(data.endDate) : null;

      const updated = await repo.update(req.params.id, patch);
      res.json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IRecurringInvoiceRepository>('RecurringInvoiceRepository');
      const existing = await repo.findById(req.params.id, req.companyId);
      if (!existing) throw new NotFoundError('Abono');
      await repo.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  /** Genera una factura del abono AHORA (extra, sin mover la programación). */
  async runNow(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IRecurringInvoiceRepository>('RecurringInvoiceRepository');
      const rec = await repo.findById(req.params.id, req.companyId);
      if (!rec) throw new NotFoundError('Abono');

      const invoice = await recurringInvoiceService.generateInvoiceFrom(rec, new Date());
      await repo.recordRun(rec.id, new Date());

      res.json({ status: 'success', data: invoice });
    } catch (error: any) {
      next(error instanceof AppError ? error : new AppError(error.message ?? 'Error al generar la factura', 400));
    }
  }

  /** Corre el generador manualmente (además del scheduler automático). */
  async generateDue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await recurringInvoiceService.generateDueInvoices();
      res.json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }
}
