import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ICashRegisterRepository } from '../../../domain/repositories/ICashRegisterRepository';
import { NotFoundError } from '../../../shared/errors/AppError';

export class CashRegisterController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const cashRegister = await repo.create({ ...req.body, companyId: req.companyId });
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
      const cashRegister = await repo.findById(req.params.id);
      if (!cashRegister) throw new NotFoundError('Caja');
      res.json({ status: 'success', data: cashRegister });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Caja');
      const cashRegister = await repo.update(req.params.id, req.body);
      res.json({ status: 'success', data: cashRegister });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Caja');
      await repo.delete(req.params.id);
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
      const cashRegister = await repo.findById(req.params.id);
      if (!cashRegister) throw new NotFoundError('Caja');

      const preview = await repo.getClosePreview(req.params.id);
      res.json({ status: 'success', data: preview });
    } catch (error) {
      next(error);
    }
  }

  async createClose(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const cashRegister = await repo.findById(req.params.id);
      if (!cashRegister) throw new NotFoundError('Caja');

      const close = await repo.createClose(req.params.id, {
        notes: req.body.notes,
        userId: req.user?.userId,
      });

      res.status(201).json({ status: 'success', data: close });
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
