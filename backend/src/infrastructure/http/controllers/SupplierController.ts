import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ISupplierRepository } from '../../../domain/repositories/ISupplierRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError } from '../../../shared/errors/AppError';
import { createSupplierRetentionSchema, updateSupplierRetentionSchema } from '../../../application/dtos/supplier.dto';
import prisma from '../../database/prisma';

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
          companyId: req.companyId,
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
      const supplier = await repo.findById(req.params.id, req.companyId);
      if (!supplier) throw new NotFoundError('Supplier');
      res.json({ status: 'success', data: supplier });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ISupplierRepository>('SupplierRepository');
      const supplier = await repo.create({ ...req.body, companyId: req.companyId });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'Supplier',
        entityId: supplier.id,
        description: `Proveedor ${supplier.name} creado`,
      });

      res.status(201).json({ status: 'success', data: supplier });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ISupplierRepository>('SupplierRepository');
      const existing = await repo.findById(req.params.id, req.companyId);
      if (!existing) throw new NotFoundError('Supplier');
      const supplier = await repo.update(req.params.id, req.body);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'Supplier',
        entityId: supplier.id,
        description: `Proveedor ${supplier.name} actualizado`,
      });

      res.json({ status: 'success', data: supplier });
    } catch (error) {
      next(error);
    }
  }

  async findProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ISupplierRepository>('SupplierRepository');
      const supplier = await repo.findById(req.params.id, req.companyId);
      if (!supplier) throw new NotFoundError('Supplier');

      const supplierId = req.params.id;
      const rows = await prisma.$queryRaw<any[]>`
        SELECT
          p.id,
          p.name,
          p.sku,
          p.price::float              AS price,
          p."isActive",
          COUNT(DISTINCT pu.id)::int  AS "purchaseCount",
          SUM(pi.quantity)::float     AS "totalQuantity",
          MAX(pu."createdAt")         AS "lastPurchaseDate",
          (
            SELECT pi2."unitPrice"::float
            FROM   purchase_items pi2
            JOIN   purchases      pu2 ON pi2."purchaseId" = pu2.id
            WHERE  pi2."productId" = p.id
              AND  pu2."supplierId" = ${supplierId}
            ORDER BY pu2."createdAt" DESC
            LIMIT 1
          ) AS "lastUnitPrice"
        FROM  purchase_items pi
        JOIN  purchases pu ON pi."purchaseId" = pu.id
        JOIN  products  p  ON pi."productId"  = p.id
        WHERE pu."supplierId" = ${supplierId}
          AND pi."productId"  IS NOT NULL
        GROUP BY p.id, p.name, p.sku, p.price, p."isActive"
        ORDER BY "lastPurchaseDate" DESC
      `;

      res.json({ status: 'success', data: rows });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ISupplierRepository>('SupplierRepository');
      const existing = await repo.findById(req.params.id, req.companyId);
      if (!existing) throw new NotFoundError('Supplier');
      await repo.delete(req.params.id);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'DELETE',
        entity: 'Supplier',
        entityId: req.params.id,
        description: `Proveedor ${existing.name} eliminado`,
      });

      res.json({ status: 'success', message: 'Proveedor eliminado' });
    } catch (error) {
      next(error);
    }
  }

  // ── Retenciones configuradas del proveedor ──────────────────────────────
  // Se practican al emitir la Orden de Pago, que las propone calculando la
  // alícuota sobre la base (NETO / IVA / BRUTO) de las facturas seleccionadas.

  async findRetentions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ISupplierRepository>('SupplierRepository');
      const supplier = await repo.findById(req.params.id, req.companyId);
      if (!supplier) throw new NotFoundError('Supplier');

      const onlyActive = req.query.isActive === 'true';
      const retentions = await repo.findRetentions(req.params.id, req.companyId, onlyActive);
      res.json({ status: 'success', data: retentions });
    } catch (error) {
      next(error);
    }
  }

  async createRetention(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ISupplierRepository>('SupplierRepository');
      const supplier = await repo.findById(req.params.id, req.companyId);
      if (!supplier) throw new NotFoundError('Supplier');

      const body = createSupplierRetentionSchema.parse(req.body);
      const retention = await repo.createRetention({
        ...body,
        supplierId: req.params.id,
        companyId: req.companyId!,
      });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'SupplierRetention',
        entityId: retention.id,
        description: `Retención ${retention.type} ${retention.percentage}% s/${retention.base} configurada para ${supplier.name}`,
      });

      res.status(201).json({ status: 'success', data: retention });
    } catch (error) {
      next(error);
    }
  }

  async updateRetention(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ISupplierRepository>('SupplierRepository');
      const existing = await repo.findRetentionById(req.params.retentionId, req.companyId);
      if (!existing || existing.supplierId !== req.params.id) throw new NotFoundError('SupplierRetention');

      const body = updateSupplierRetentionSchema.parse(req.body);
      const retention = await repo.updateRetention(req.params.retentionId, body);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'SupplierRetention',
        entityId: retention.id,
        description: `Retención ${retention.type} actualizada a ${retention.percentage}% s/${retention.base}`,
      });

      res.json({ status: 'success', data: retention });
    } catch (error) {
      next(error);
    }
  }

  async deleteRetention(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ISupplierRepository>('SupplierRepository');
      const existing = await repo.findRetentionById(req.params.retentionId, req.companyId);
      if (!existing || existing.supplierId !== req.params.id) throw new NotFoundError('SupplierRetention');

      await repo.deleteRetention(req.params.retentionId);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'DELETE',
        entity: 'SupplierRetention',
        entityId: req.params.retentionId,
        description: `Retención ${existing.type} eliminada`,
      });

      res.json({ status: 'success', message: 'Retención eliminada' });
    } catch (error) {
      next(error);
    }
  }
}
