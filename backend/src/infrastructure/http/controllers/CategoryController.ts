import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ICategoryRepository } from '../../../domain/repositories/ICategoryRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError } from '../../../shared/errors/AppError';
import { createCategorySchema, updateCategorySchema } from '../../../application/dtos/category.dto';

export class CategoryController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICategoryRepository>('CategoryRepository');
      const categories = await repo.findAll(req.companyId);
      res.json({ status: 'success', data: categories });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICategoryRepository>('CategoryRepository');
      const category = await repo.findById(req.params.id, req.companyId);
      if (!category) throw new NotFoundError('Categoría');
      res.json({ status: 'success', data: category });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICategoryRepository>('CategoryRepository');
      const data = createCategorySchema.parse(req.body);
      const category = await repo.create({ ...data, description: data.description ?? null, companyId: req.companyId! });
      this._log(req, 'CREATE', category.id, `Category "${category.name}" creado`);
      res.status(201).json({ status: 'success', data: category });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICategoryRepository>('CategoryRepository');
      const existing = await repo.findById(req.params.id, req.companyId);
      if (!existing) throw new NotFoundError('Categoría');
      const data = updateCategorySchema.parse(req.body);
      const category = await repo.update(req.params.id, data);
      this._log(req, 'UPDATE', category.id, `Category "${category.name}" actualizado`);
      res.json({ status: 'success', data: category });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICategoryRepository>('CategoryRepository');
      const existing = await repo.findById(req.params.id, req.companyId);
      if (!existing) throw new NotFoundError('Categoría');
      await repo.delete(req.params.id);
      this._log(req, 'DELETE', req.params.id, `Category "${existing.name}" eliminado`);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  private _log(req: Request, action: 'CREATE' | 'UPDATE' | 'DELETE', entityId: string, description: string): void {
    const logRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
    logRepo.create({ userId: req.user!.userId, action, entity: 'Category', entityId, description })
      .catch(() => { /* log failure is non-critical */ });
  }
}
