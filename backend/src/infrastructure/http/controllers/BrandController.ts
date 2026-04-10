import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IBrandRepository } from '../../../domain/repositories/IBrandRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError } from '../../../shared/errors/AppError';

export class BrandController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBrandRepository>('BrandRepository');
      const brand = await (repo as any).create({
        name: req.body.name,
        isActive: req.body.isActive ?? true,
        companyId: req.companyId,
      });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'Brand',
        entityId: brand.id,
        description: `Marca ${brand.name} creada`,
      });

      res.status(201).json({ status: 'success', data: brand });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBrandRepository>('BrandRepository');
      const brand = await repo.findById(req.params.id);
      if (!brand) throw new NotFoundError('Brand');
      res.json({ status: 'success', data: brand });
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBrandRepository>('BrandRepository');
      const brands = await (repo as any).findAll(req.companyId);
      res.json({ status: 'success', data: brands });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBrandRepository>('BrandRepository');
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Brand');
      const brand = await repo.update(req.params.id, {
        name: req.body.name,
        isActive: req.body.isActive,
      });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'Brand',
        entityId: brand.id,
        description: `Marca ${brand.name} actualizada`,
      });

      res.json({ status: 'success', data: brand });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBrandRepository>('BrandRepository');
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Brand');
      await repo.delete(req.params.id);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'DELETE',
        entity: 'Brand',
        entityId: req.params.id,
        description: `Marca ${existing.name} eliminada`,
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
