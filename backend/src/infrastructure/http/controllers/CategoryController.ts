import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ICategoryRepository } from '../../../domain/repositories/ICategoryRepository';
import { NotFoundError } from '../../../shared/errors/AppError';

export class CategoryController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categoryRepository = container.resolve<ICategoryRepository>('CategoryRepository');

      const category = await categoryRepository.create({
        name: req.body.name,
        parentId: req.body.parentId ?? null,
      });

      res.status(201).json({
        status: 'success',
        data: { category },
      });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categoryRepository = container.resolve<ICategoryRepository>('CategoryRepository');
      const category = await categoryRepository.findById(req.params.id);

      if (!category) {
        throw new NotFoundError('Category');
      }

      res.json({
        status: 'success',
        data: { category },
      });
    } catch (error) {
      next(error);
    }
  }

  async findAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categoryRepository = container.resolve<ICategoryRepository>('CategoryRepository');
      const categories = await categoryRepository.findAll();

      res.json({
        status: 'success',
        data: { categories },
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categoryRepository = container.resolve<ICategoryRepository>('CategoryRepository');

      const existingCategory = await categoryRepository.findById(req.params.id);
      if (!existingCategory) {
        throw new NotFoundError('Category');
      }

      const category = await categoryRepository.update(req.params.id, {
        name: req.body.name,
        parentId: req.body.parentId,
      });

      res.json({
        status: 'success',
        data: { category },
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categoryRepository = container.resolve<ICategoryRepository>('CategoryRepository');

      const existingCategory = await categoryRepository.findById(req.params.id);
      if (!existingCategory) {
        throw new NotFoundError('Category');
      }

      await categoryRepository.delete(req.params.id);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
