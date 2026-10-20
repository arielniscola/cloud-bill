import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IProvinciaRepository } from '../../../domain/repositories/IProvinciaRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { createProvinciaSchema, updateProvinciaSchema } from '../../../application/dtos/provincia.dto';
import { normalizeProvinciaName } from '../../../shared/constants/provincias';

export class ProvinciaController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProvinciaRepository>('ProvinciaRepository');
      res.json({ status: 'success', data: await repo.findAll(req.companyId!) });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProvinciaRepository>('ProvinciaRepository');
      const provincia = await repo.findById(req.params.id, req.companyId);
      if (!provincia) throw new NotFoundError('Provincia');
      res.json({ status: 'success', data: provincia });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProvinciaRepository>('ProvinciaRepository');
      const data = createProvinciaSchema.parse(req.body);
      await this._assertUniqueName(repo, req.companyId!, data.name);
      const provincia = await repo.create({ ...data, companyId: req.companyId! });
      this._log(req, 'CREATE', provincia.id, `Provincia ${provincia.name} creada`);
      res.status(201).json({ status: 'success', data: provincia });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProvinciaRepository>('ProvinciaRepository');
      const existing = await repo.findById(req.params.id, req.companyId);
      if (!existing) throw new NotFoundError('Provincia');
      const data = updateProvinciaSchema.parse(req.body);
      if (data.name !== undefined) await this._assertUniqueName(repo, req.companyId!, data.name, existing.id);
      const provincia = await repo.update(existing.id, data);
      this._log(req, 'UPDATE', provincia.id, `Provincia ${provincia.name} actualizada`);
      res.json({ status: 'success', data: provincia });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProvinciaRepository>('ProvinciaRepository');
      const existing = await repo.findById(req.params.id, req.companyId);
      if (!existing) throw new NotFoundError('Provincia');
      await repo.delete(existing.id);
      this._log(req, 'DELETE', existing.id, `Provincia ${existing.name} desactivada`);
      res.json({ status: 'success', data: null });
    } catch (error) {
      next(error);
    }
  }

  /** "Cordoba" y "Córdoba" son la misma: se compara sin acentos ni mayúsculas. */
  private async _assertUniqueName(repo: IProvinciaRepository, companyId: string, name: string, exceptId?: string) {
    const n = normalizeProvinciaName(name);
    const clash = (await repo.findAll(companyId)).find((p) => p.id !== exceptId && normalizeProvinciaName(p.name) === n);
    if (clash) throw new AppError(`Ya existe la provincia "${clash.name}"`, 400);
  }

  private _log(req: Request, action: 'CREATE' | 'UPDATE' | 'DELETE', entityId: string, description: string): void {
    const logRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
    logRepo.create({ userId: req.user!.userId, action, entity: 'Provincia', entityId, description })
      .catch(() => { /* log failure is non-critical */ });
  }
}
