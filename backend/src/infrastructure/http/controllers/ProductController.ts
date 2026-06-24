import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError, ConflictError } from '../../../shared/errors/AppError';
import { Decimal } from '@prisma/client/runtime/library';
import {
  upsertCustomFieldValues,
  getCustomFieldValuesForProduct,
  getCustomFieldValuesForProducts,
} from '../../database/repositories/productCustomFieldValuesHelper';
import { ProductCustomFieldValueInput } from '../../../domain/entities/ProductCustomField';

function parseCustomFieldsPayload(body: any): ProductCustomFieldValueInput[] | null {
  if (!Array.isArray(body?.customFields)) return null;
  return body.customFields
    .filter((cf: any) => cf && typeof cf.fieldId === 'string')
    .map((cf: any) => ({
      fieldId: cf.fieldId,
      value: cf.value === undefined || cf.value === null ? null : String(cf.value),
    }));
}

export class ProductController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productRepository = container.resolve<IProductRepository>('ProductRepository');

      const existingProduct = await productRepository.findBySku(req.body.sku, req.companyId!);
      if (existingProduct) {
        throw new ConflictError('Ya existe un producto con este código en tu empresa');
      }

      const product = await productRepository.create({
        sku: req.body.sku,
        name: req.body.name,
        companyId: req.companyId,
        description: req.body.description ?? null,
        rubroId: req.body.rubroId ?? null,
        brandId: req.body.brandId ?? null,
        categoryId: req.body.categoryId ?? null,
        barcode: req.body.barcode ?? null,
        unit: req.body.unit ?? null,
        internalNotes: req.body.internalNotes ?? null,
        cost: new Decimal(req.body.cost),
        price: new Decimal(req.body.price),
        salePriceUSD: req.body.salePriceUSD != null ? new Decimal(req.body.salePriceUSD) : null,
        taxRate: new Decimal(req.body.taxRate ?? 21),
        isActive: req.body.isActive ?? true,
      });

      const customFields = parseCustomFieldsPayload(req.body);
      if (customFields && customFields.length > 0 && req.companyId) {
        await upsertCustomFieldValues(product.id, customFields, req.companyId);
      }

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'Product',
        entityId: product.id,
        description: `Producto ${product.name} (${product.sku}) creado`,
      });

      const enriched = { ...product, customFieldValues: await getCustomFieldValuesForProduct(product.id) };
      res.status(201).json({
        status: 'success',
        data: enriched,
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

      const enriched = { ...product, customFieldValues: await getCustomFieldValuesForProduct(product.id) };
      res.json({
        status: 'success',
        data: enriched,
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
        { ...(filters as Record<string, string>), companyId: req.companyId }
      );

      const includeFields = req.query.includeCustomFields === 'true';
      let data = result.data;
      if (includeFields && data.length > 0) {
        const valuesMap = await getCustomFieldValuesForProducts(data.map((p) => p.id));
        data = data.map((p) => ({ ...p, customFieldValues: valuesMap.get(p.id) ?? [] }));
      }

      res.json({
        status: 'success',
        ...result,
        data,
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
        const productWithSku = await productRepository.findBySku(req.body.sku, req.companyId!);
        if (productWithSku) {
          throw new ConflictError('Ya existe un producto con este código en tu empresa');
        }
      }

      const updateData: Record<string, unknown> = {};
      if (req.body.sku !== undefined) updateData.sku = req.body.sku;
      if (req.body.name !== undefined) updateData.name = req.body.name;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.rubroId !== undefined) updateData.rubroId = req.body.rubroId;
      if (req.body.brandId !== undefined) updateData.brandId = req.body.brandId;
      if (req.body.categoryId !== undefined) updateData.categoryId = req.body.categoryId;
      if (req.body.barcode !== undefined) updateData.barcode = req.body.barcode;
      if (req.body.unit !== undefined) updateData.unit = req.body.unit;
      if (req.body.internalNotes !== undefined) updateData.internalNotes = req.body.internalNotes;
      if (req.body.cost !== undefined) updateData.cost = new Decimal(req.body.cost);
      if (req.body.price !== undefined) updateData.price = new Decimal(req.body.price);
      if (req.body.salePriceUSD !== undefined) updateData.salePriceUSD = req.body.salePriceUSD != null ? new Decimal(req.body.salePriceUSD) : null;
      if (req.body.taxRate !== undefined) updateData.taxRate = new Decimal(req.body.taxRate);
      if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive;

      const product = await productRepository.update(req.params.id, updateData);

      const customFields = parseCustomFieldsPayload(req.body);
      if (customFields && req.companyId) {
        await upsertCustomFieldValues(product.id, customFields, req.companyId);
      }

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'Product',
        entityId: product.id,
        description: `Producto ${product.name} actualizado`,
      });

      const enriched = { ...product, customFieldValues: await getCustomFieldValuesForProduct(product.id) };
      res.json({
        status: 'success',
        data: enriched,
      });
    } catch (error) {
      next(error);
    }
  }

  async bulkUpdatePrices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productRepository = container.resolve<IProductRepository>('ProductRepository');
      const updates: Array<{ id: string; price?: number; cost?: number; salePriceUSD?: number | null }> = req.body.updates;

      if (!Array.isArray(updates) || updates.length === 0) {
        res.status(400).json({ status: 'error', message: 'No hay actualizaciones' });
        return;
      }

      await Promise.all(
        updates.map(({ id, price, cost, salePriceUSD }) => {
          const data: Record<string, unknown> = {};
          if (price        !== undefined) data.price       = new Decimal(price);
          if (cost         !== undefined) data.cost        = new Decimal(cost);
          if (salePriceUSD !== undefined) data.salePriceUSD = salePriceUSD != null ? new Decimal(salePriceUSD) : null;
          return productRepository.update(id, data);
        })
      );

      res.json({ status: 'success', updated: updates.length });
    } catch (error) {
      next(error);
    }
  }

  /** Bulk-set fields (marca, alícuota, rubro/subrubro, estado) on many products at once. */
  async bulkUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productRepository = container.resolve<IProductRepository>('ProductRepository');
      const ids: string[] = req.body.ids;
      const data: { brandId?: string | null; taxRate?: number; rubroId?: string | null; isActive?: boolean } = req.body.data ?? {};

      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ status: 'error', message: 'No hay productos seleccionados' });
        return;
      }

      const patch: Record<string, unknown> = {};
      if (data.brandId  !== undefined) patch.brandId  = data.brandId || null;
      if (data.rubroId  !== undefined) patch.rubroId  = data.rubroId || null;
      if (data.taxRate  !== undefined) patch.taxRate  = new Decimal(data.taxRate);
      if (data.isActive !== undefined) patch.isActive = data.isActive;

      if (Object.keys(patch).length === 0) {
        res.status(400).json({ status: 'error', message: 'No hay campos para actualizar' });
        return;
      }

      await Promise.all(ids.map((id) => productRepository.update(id, patch as any)));

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'Product',
        entityId: ids[0],
        description: `Actualización masiva de ${ids.length} producto(s): ${Object.keys(patch).join(', ')}`,
      }).catch(() => { /* log no crítico */ });

      res.json({ status: 'success', updated: ids.length });
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

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'DELETE',
        entity: 'Product',
        entityId: req.params.id,
        description: `Producto ${existingProduct.name} (${existingProduct.sku}) eliminado`,
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
