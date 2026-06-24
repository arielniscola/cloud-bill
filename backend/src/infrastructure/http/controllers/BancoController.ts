import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IBancoRepository } from '../../../domain/repositories/IBancoRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError } from '../../../shared/errors/AppError';
import { createBancoSchema, updateBancoSchema } from '../../../application/dtos/banco.dto';

export class BancoController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBancoRepository>('BancoRepository');
      const bancos = await repo.findAll(req.companyId!);
      res.json({ status: 'success', data: bancos });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBancoRepository>('BancoRepository');
      const banco = await repo.findById(req.params.id);
      if (!banco) throw new NotFoundError('Banco');
      res.json({ status: 'success', data: banco });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBancoRepository>('BancoRepository');
      const data = createBancoSchema.parse(req.body);
      const banco = await repo.create({ ...data, companyId: req.companyId! });
      this._log(req, 'CREATE', banco.id, `Banco ${banco.name} creado`);
      res.status(201).json({ status: 'success', data: banco });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBancoRepository>('BancoRepository');
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Banco');
      const data = updateBancoSchema.parse(req.body);
      const banco = await repo.update(req.params.id, data);
      this._log(req, 'UPDATE', banco.id, `Banco ${banco.name} actualizado`);
      res.json({ status: 'success', data: banco });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBancoRepository>('BancoRepository');
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Banco');
      await repo.delete(req.params.id);
      this._log(req, 'DELETE', req.params.id, `Banco ${existing.name} desactivado`);
      res.json({ status: 'success', data: null });
    } catch (error) {
      next(error);
    }
  }

  private _log(req: Request, action: 'CREATE' | 'UPDATE' | 'DELETE', entityId: string, description: string): void {
    const logRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
    logRepo.create({ userId: req.user!.userId, action, entity: 'Banco', entityId, description })
      .catch(() => { /* log failure is non-critical */ });
  }
}
