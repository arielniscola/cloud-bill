import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ISupplierRepository } from '../../../domain/repositories/ISupplierRepository';
import { NotFoundError } from '../../../shared/errors/AppError';

export class SupplierController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ISupplierRepository>('SupplierRepository');
      const { page, limit, search, isActive } = req.query;

      const result = await repo.findAll(
        { page: Number(page) || 1, limit: Number(limit) || 20 },
        {
          search: search as string | undefined,
          isActive: isActive !== undefined ? isActive === 'true' : undefined,
        }
      );

      res.json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ISupplierRepository>('SupplierRepository');
      const supplier = await repo.findById(req.params.id);
      if (!supplier) throw new NotFoundError('Supplier');
      res.json({ status: 'success', data: supplier });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ISupplierRepository>('SupplierRepository');
      const supplier = await repo.create(req.body);
      res.status(201).json({ status: 'success', data: supplier });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ISupplierRepository>('SupplierRepository');
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Supplier');
      const supplier = await repo.update(req.params.id, req.body);
      res.json({ status: 'success', data: supplier });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ISupplierRepository>('SupplierRepository');
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Supplier');
      await repo.delete(req.params.id);
      res.json({ status: 'success', message: 'Proveedor eliminado' });
    } catch (error) {
      next(error);
    }
  }
}
