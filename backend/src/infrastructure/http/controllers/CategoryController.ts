import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ICategoryRepository } from '../../../domain/repositories/ICategoryRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError } from '../../../shared/errors/AppError';

export class CategoryController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categoryRepository = container.resolve<ICategoryRepository>('CategoryRepository');

      const category = await categoryRepository.create({
        name: req.body.name,
        parentId: req.body.parentId ?? null,
        companyId: req.companyId,
      });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'Category',
        entityId: category.id,
        description: `Categoría ${category.name} creada`,
      });

      res.status(201).json({
        status: 'success',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categoryRepository = container.resolve<ICategoryRepository>('CategoryRepository');
      const category = await categoryRepository.findById(req.params.id);

      if (!category || (category as any).companyId !== req.companyId) {
        throw new NotFoundError('Category');
      }

      res.json({
        status: 'success',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categoryRepository = container.resolve<ICategoryRepository>('CategoryRepository');
      const categories = await categoryRepository.findAll(req.companyId);

      res.json({
        status: 'success',
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categoryRepository = container.resolve<ICategoryRepository>('CategoryRepository');

      const existingCategory = await categoryRepository.findById(req.params.id);
      if (!existingCategory || (existingCategory as any).companyId !== req.companyId) {
        throw new NotFoundError('Category');
      }

      const category = await categoryRepository.update(req.params.id, {
        name: req.body.name,
        parentId: req.body.parentId,
      });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'Category',
        entityId: category.id,
        description: `Categoría ${category.name} actualizada`,
      });

      res.json({
        status: 'success',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categoryRepository = container.resolve<ICategoryRepository>('CategoryRepository');

      const existingCategory = await categoryRepository.findById(req.params.id);
      if (!existingCategory || (existingCategory as any).companyId !== req.companyId) {
        throw new NotFoundError('Category');
      }

      await categoryRepository.delete(req.params.id);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'DELETE',
        entity: 'Category',
        entityId: req.params.id,
        description: `Categoría ${existingCategory.name} eliminada`,
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
