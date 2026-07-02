import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IProductVariantRepository } from '../../../domain/repositories/IProductVariantRepository';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError, ConflictError, AppError } from '../../../shared/errors/AppError';
import {
  createProductVariantSchema,
  updateProductVariantSchema,
  bulkCreateProductVariantSchema,
} from '../../../application/dtos/productVariant.dto';

export class ProductVariantController {
  async findByProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProductVariantRepository>('ProductVariantRepository');
      const productRepo = container.resolve<IProductRepository>('ProductRepository');
      const product = await productRepo.findById(req.params.productId, req.companyId);
      if (!product) throw new NotFoundError('Producto');
      const variants = await repo.findByProduct(req.params.productId);
      res.json({ status: 'success', data: variants });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProductVariantRepository>('ProductVariantRepository');
      const variant = await repo.findById(req.params.id, req.companyId);
      if (!variant) throw new NotFoundError('Variante');
      res.json({ status: 'success', data: variant });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProductVariantRepository>('ProductVariantRepository');
      const productRepo = container.resolve<IProductRepository>('ProductRepository');

      const product = await productRepo.findById(req.params.productId, req.companyId);
      if (!product) throw new NotFoundError('Producto');

      const data = createProductVariantSchema.parse(req.body);

      const existing = await repo.findBySku(data.sku, req.companyId!);
      if (existing) throw new ConflictError('Ya existe una variante con este SKU en tu empresa');

      const variant = await repo.create({
        productId: req.params.productId,
        sku: data.sku,
        name: data.name,
        attributes: data.attributes,
        priceOverride: data.priceOverride ?? null,
        costOverride: data.costOverride ?? null,
        barcode: data.barcode ?? null,
        isActive: data.isActive,
        companyId: req.companyId!,
      });

      this._log(req, 'CREATE', variant.id, `Variante "${variant.name}" creada para producto ${product.sku}`);
      res.status(201).json({ status: 'success', data: variant });
    } catch (error) {
      next(error);
    }
  }

  async bulkCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProductVariantRepository>('ProductVariantRepository');
      const productRepo = container.resolve<IProductRepository>('ProductRepository');

      const product = await productRepo.findById(req.params.productId, req.companyId);
      if (!product) throw new NotFoundError('Producto');

      const data = bulkCreateProductVariantSchema.parse(req.body);

      // Combinatoria
      const attrKeys = Object.keys(data.attributeMatrix);
      if (attrKeys.length === 0) throw new AppError('Debe especificar al menos un atributo', 400);

      const combos: Array<Record<string, string>> = [{}];
      for (const key of attrKeys) {
        const values = data.attributeMatrix[key];
        const next: Array<Record<string, string>> = [];
        for (const combo of combos) {
          for (const v of values) {
            next.push({ ...combo, [key]: v });
          }
        }
        combos.length = 0;
        combos.push(...next);
      }

      const inputs = combos.map((combo) => {
        const skuSuffix = attrKeys.map((k) => combo[k]).join('-').toUpperCase().replace(/\s+/g, '');
        const nameStr = attrKeys.map((k) => `${combo[k]}`).join(' / ');
        return {
          productId: req.params.productId,
          sku: `${data.skuPrefix}-${skuSuffix}`,
          name: nameStr,
          attributes: combo,
          priceOverride: data.priceOverride ?? null,
          costOverride: data.costOverride ?? null,
          isActive: true,
          companyId: req.companyId!,
        };
      });

      // Pre-check conflicts
      for (const input of inputs) {
        const existing = await repo.findBySku(input.sku, req.companyId!);
        if (existing) throw new ConflictError(`SKU duplicado: ${input.sku}`);
      }

      const variants = await repo.createMany(inputs);
      this._log(req, 'CREATE', product.id, `${variants.length} variantes creadas para producto ${product.sku}`);
      res.status(201).json({ status: 'success', data: variants });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProductVariantRepository>('ProductVariantRepository');
      const existing = await repo.findById(req.params.id, req.companyId);
      if (!existing) throw new NotFoundError('Variante');

      const data = updateProductVariantSchema.parse(req.body);

      if (data.sku && data.sku !== existing.sku) {
        const duplicate = await repo.findBySku(data.sku, existing.companyId);
        if (duplicate) throw new ConflictError('Ya existe una variante con este SKU en tu empresa');
      }

      const variant = await repo.update(req.params.id, data);
      this._log(req, 'UPDATE', variant.id, `Variante "${variant.name}" actualizada`);
      res.json({ status: 'success', data: variant });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProductVariantRepository>('ProductVariantRepository');
      const existing = await repo.findById(req.params.id, req.companyId);
      if (!existing) throw new NotFoundError('Variante');
      await repo.delete(req.params.id);
      this._log(req, 'DELETE', req.params.id, `Variante "${existing.name}" eliminada`);
      res.json({ status: 'success', data: null });
    } catch (error) {
      next(error);
    }
  }

  private _log(req: Request, action: 'CREATE' | 'UPDATE' | 'DELETE', entityId: string, description: string): void {
    const logRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
    logRepo.create({ userId: req.user!.userId, action, entity: 'ProductVariant', entityId, description })
      .catch(() => { /* non-critical */ });
  }
}
