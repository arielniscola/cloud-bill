import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IRubroRepository } from '../../../domain/repositories/IRubroRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError } from '../../../shared/errors/AppError';
import { createRubroSchema, updateRubroSchema } from '../../../application/dtos/rubro.dto';

export class RubroController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IRubroRepository>('RubroRepository');
      const rubros = await repo.findAll(req.companyId);
      res.json({ status: 'success', data: rubros });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IRubroRepository>('RubroRepository');
      const rubro = await repo.findById(req.params.id);
      if (!rubro) throw new NotFoundError('Rubro');
      res.json({ status: 'success', data: rubro });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IRubroRepository>('RubroRepository');
      const data = createRubroSchema.parse(req.body);
      const rubro = await repo.create({ ...data, companyId: req.companyId });
      this._log(req, 'CREATE', rubro.id, `Rubro "${rubro.name}" creado`);
      res.status(201).json({ status: 'success', data: rubro });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IRubroRepository>('RubroRepository');
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Rubro');
      const data = updateRubroSchema.parse(req.body);
      const rubro = await repo.update(req.params.id, data);
      this._log(req, 'UPDATE', rubro.id, `Rubro "${rubro.name}" actualizado`);
      res.json({ status: 'success', data: rubro });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IRubroRepository>('RubroRepository');
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Rubro');
      await repo.delete(req.params.id);
      this._log(req, 'DELETE', req.params.id, `Rubro "${existing.name}" eliminado`);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  private _log(req: Request, action: 'CREATE' | 'UPDATE' | 'DELETE', entityId: string, description: string): void {
    const logRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
    logRepo.create({ userId: req.user!.userId, action, entity: 'Rubro', entityId, description })
      .catch(() => { /* log failure is non-critical */ });
  }
}
