import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ISupplierRepository } from '../../../domain/repositories/ISupplierRepository';
import { NotFoundError } from '../../../shared/errors/AppError';
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

  async findProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ISupplierRepository>('SupplierRepository');
      const supplier = await repo.findById(req.params.id);
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
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Supplier');
      await repo.delete(req.params.id);
      res.json({ status: 'success', message: 'Proveedor eliminado' });
    } catch (error) {
      next(error);
    }
  }
}
