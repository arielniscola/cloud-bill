import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { NotFoundError, ConflictError } from '../../../shared/errors/AppError';
import { Decimal } from '@prisma/client/runtime/library';

export class ProductController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productRepository = container.resolve<IProductRepository>('ProductRepository');

      const existingProduct = await productRepository.findBySku(req.body.sku);
      if (existingProduct) {
        throw new ConflictError('Product with this SKU already exists');
      }

      const product = await productRepository.create({
        sku: req.body.sku,
        name: req.body.name,
        description: req.body.description ?? null,
        categoryId: req.body.categoryId ?? null,
        cost: new Decimal(req.body.cost),
        price: new Decimal(req.body.price),
        taxRate: new Decimal(req.body.taxRate ?? 21),
        isActive: req.body.isActive ?? true,
      });

      res.status(201).json({
        status: 'success',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productRepository = container.resolve<IProductRepository>('ProductRepository');
      const product = await productRepository.findById(req.params.id);

      if (!product) {
        throw new NotFoundError('Product');
      }

      res.json({
        status: 'success',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productRepository = container.resolve<IProductRepository>('ProductRepository');
      const { page, limit, ...filters } = req.query;

      const result = await productRepository.findAll(
        { page: Number(page) || 1, limit: Number(limit) || 10 },
        filters as Record<string, string>
      );

      res.json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productRepository = container.resolve<IProductRepository>('ProductRepository');

      const existingProduct = await productRepository.findById(req.params.id);
      if (!existingProduct) {
        throw new NotFoundError('Product');
      }

      if (req.body.sku && req.body.sku !== existingProduct.sku) {
        const productWithSku = await productRepository.findBySku(req.body.sku);
        if (productWithSku) {
          throw new ConflictError('Product with this SKU already exists');
        }
      }

      const updateData: Record<string, unknown> = {};
      if (req.body.sku !== undefined) updateData.sku = req.body.sku;
      if (req.body.name !== undefined) updateData.name = req.body.name;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.categoryId !== undefined) updateData.categoryId = req.body.categoryId;
      if (req.body.cost !== undefined) updateData.cost = new Decimal(req.body.cost);
      if (req.body.price !== undefined) updateData.price = new Decimal(req.body.price);
      if (req.body.taxRate !== undefined) updateData.taxRate = new Decimal(req.body.taxRate);
      if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive;

      const product = await productRepository.update(req.params.id, updateData);

      res.json({
        status: 'success',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productRepository = container.resolve<IProductRepository>('ProductRepository');

      const existingProduct = await productRepository.findById(req.params.id);
      if (!existingProduct) {
        throw new NotFoundError('Product');
      }

      await productRepository.delete(req.params.id);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
