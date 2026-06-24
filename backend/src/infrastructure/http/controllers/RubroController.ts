import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IRubroRepository } from '../../../domain/repositories/IRubroRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError } from '../../../shared/errors/AppError';

export class RubroController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rubroRepository = container.resolve<IRubroRepository>('RubroRepository');

      const rubro = await rubroRepository.create({
        name: req.body.name,
        parentId: req.body.parentId ?? null,
        companyId: req.companyId,
      });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'Rubro',
        entityId: rubro.id,
        description: `Rubro ${rubro.name} creada`,
      });

      res.status(201).json({
        status: 'success',
        data: rubro,
      });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rubroRepository = container.resolve<IRubroRepository>('RubroRepository');
      const rubro = await rubroRepository.findById(req.params.id);

      if (!rubro || (rubro as any).companyId !== req.companyId) {
        throw new NotFoundError('Rubro');
      }

      res.json({
        status: 'success',
        data: rubro,
      });
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rubroRepository = container.resolve<IRubroRepository>('RubroRepository');
      const rubros = await rubroRepository.findAll(req.companyId);

      res.json({
        status: 'success',
        data: rubros,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rubroRepository = container.resolve<IRubroRepository>('RubroRepository');

      const existingRubro = await rubroRepository.findById(req.params.id);
      if (!existingRubro || (existingRubro as any).companyId !== req.companyId) {
        throw new NotFoundError('Rubro');
      }

      const rubro = await rubroRepository.update(req.params.id, {
        name: req.body.name,
        parentId: req.body.parentId,
      });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'Rubro',
        entityId: rubro.id,
        description: `Rubro ${rubro.name} actualizada`,
      });

      res.json({
        status: 'success',
        data: rubro,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rubroRepository = container.resolve<IRubroRepository>('RubroRepository');

      const existingRubro = await rubroRepository.findById(req.params.id);
      if (!existingRubro || (existingRubro as any).companyId !== req.companyId) {
        throw new NotFoundError('Rubro');
      }

      await rubroRepository.delete(req.params.id);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'DELETE',
        entity: 'Rubro',
        entityId: req.params.id,
        description: `Rubro ${existingRubro.name} eliminada`,
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
