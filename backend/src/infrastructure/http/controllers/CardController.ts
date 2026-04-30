import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ICardRepository } from '../../../domain/repositories/ICardRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError } from '../../../shared/errors/AppError';
import { createCardSchema, updateCardSchema } from '../../../application/dtos/card.dto';

export class CardController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICardRepository>('CardRepository');
      const cards = await repo.findAll(req.companyId!);
      res.json({ status: 'success', data: cards });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICardRepository>('CardRepository');
      const card = await repo.findById(req.params.id);
      if (!card) throw new NotFoundError('Tarjeta');
      res.json({ status: 'success', data: card });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICardRepository>('CardRepository');
      const data = createCardSchema.parse(req.body);
      const card = await repo.create({ ...data, companyId: req.companyId! });
      this._log(req, 'CREATE', card.id, `Tarjeta ${card.name} creada`);
      res.status(201).json({ status: 'success', data: card });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICardRepository>('CardRepository');
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Tarjeta');
      const data = updateCardSchema.parse(req.body);
      const card = await repo.update(req.params.id, data);
      this._log(req, 'UPDATE', card.id, `Tarjeta ${card.name} actualizada`);
      res.json({ status: 'success', data: card });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICardRepository>('CardRepository');
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Tarjeta');
      await repo.delete(req.params.id);
      this._log(req, 'DELETE', req.params.id, `Tarjeta ${existing.name} desactivada`);
      res.json({ status: 'success', data: null });
    } catch (error) {
      next(error);
    }
  }

  private _log(req: Request, action: 'CREATE' | 'UPDATE' | 'DELETE', entityId: string, description: string): void {
    const logRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
    logRepo.create({ userId: req.user!.userId, action, entity: 'Card', entityId, description })
      .catch(() => { /* log failure is non-critical */ });
  }
}
