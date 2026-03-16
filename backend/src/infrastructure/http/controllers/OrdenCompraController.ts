import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { Decimal } from '@prisma/client/runtime/library';
import { IOrdenCompraRepository } from '../../../domain/repositories/IOrdenCompraRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { IStockRepository } from '../../../domain/repositories/IWarehouseRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import {
  createOrdenCompraSchema,
  updateOrdenCompraSchema,
  updateOrdenCompraStatusSchema,
  ordenCompraQuerySchema,
} from '../../../application/dtos/ordenCompra.dto';
import prisma from '../../database/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (prisma as any);

export class OrdenCompraController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo  = container.resolve<IOrdenCompraRepository>('OrdenCompraRepository');
      const query = ordenCompraQuerySchema.parse(req.query);

      const result = await repo.findAll(
        { page: query.page, limit: query.limit },
        {
          supplierId: query.supplierId,
          status:     query.status,
          dateFrom:   query.dateFrom ? new Date(query.dateFrom) : undefined,
          dateTo:     query.dateTo   ? new Date(query.dateTo)   : undefined,
        }
      );

      res.json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenCompraRepository>('OrdenCompraRepository');
      const oc   = await repo.findById(req.params.id);
      if (!oc) throw new NotFoundError('Orden de Compra');
      res.json({ status: 'success', data: oc });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo         = container.resolve<IOrdenCompraRepository>('OrdenCompraRepository');
      const activityRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const data = createOrdenCompraSchema.parse(req.body);

      let subtotal  = 0;
      let taxAmount = 0;
      const items = data.items.map((item) => {
        const s = item.quantity * item.unitPrice;
        const t = s * (item.taxRate / 100);
        subtotal  += s;
        taxAmount += t;
        return { ...item, subtotal: s, taxAmount: t, total: s + t };
      });

      const oc = await repo.create({
        supplierId:   data.supplierId,
        userId:       req.user!.userId,
        date:         data.date ? new Date(data.date) : undefined,
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
        currency:     data.currency,
        exchangeRate: data.exchangeRate,
        warehouseId:  data.warehouseId ?? null,
        notes:        data.notes ?? null,
        subtotal,
        taxAmount,
        total:        subtotal + taxAmount,
        items,
      });

      await activityRepo.create({
        userId:      req.user!.userId,
        action:      'CREATE',
        entity:      'OrdenCompra',
        entityId:    oc.id,
        description: `Orden de Compra ${oc.number} creada`,
      });

      res.status(201).json({ status: 'success', data: oc });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenCompraRepository>('OrdenCompraRepository');
      const oc   = await repo.findById(req.params.id);
      if (!oc) throw new NotFoundError('Orden de Compra');
      if (oc.status !== 'DRAFT') throw new AppError('Solo se pueden editar OC en borrador', 400);

      const data = updateOrdenCompraSchema.parse(req.body);

      let updateData: any = { ...data };

      if (data.items) {
        let subtotal  = 0;
        let taxAmount = 0;
        const items = data.items.map((item) => {
          const s = item.quantity! * item.unitPrice!;
          const t = s * ((item.taxRate ?? 0) / 100);
          subtotal  += s;
          taxAmount += t;
          return { ...item, subtotal: s, taxAmount: t, total: s + t };
        });
        updateData = { ...updateData, items, subtotal, taxAmount, total: subtotal + taxAmount };
      }

      if (data.expectedDate !== undefined) {
        updateData.expectedDate = data.expectedDate ? new Date(data.expectedDate) : null;
      }

      const updated = await repo.update(req.params.id, updateData);
      res.json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo         = container.resolve<IOrdenCompraRepository>('OrdenCompraRepository');
      const activityRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const oc = await repo.findById(req.params.id);
      if (!oc) throw new NotFoundError('Orden de Compra');
      if (oc.status === 'RECEIVED' || oc.status === 'CANCELLED') {
        throw new AppError(`No se puede cambiar el estado de una OC ${oc.status === 'RECEIVED' ? 'recibida' : 'cancelada'}`, 400);
      }

      const { status } = updateOrdenCompraStatusSchema.parse(req.body);
      const updated    = await repo.update(req.params.id, { status });

      await activityRepo.create({
        userId:      req.user!.userId,
        action:      'UPDATE',
        entity:      'OrdenCompra',
        entityId:    oc.id,
        description: `Orden de Compra ${oc.number} → ${status}`,
      });

      res.json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  async convert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo         = container.resolve<IOrdenCompraRepository>('OrdenCompraRepository');
      const activityRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const oc = await repo.findById(req.params.id);
      if (!oc) throw new NotFoundError('Orden de Compra');
      if (oc.status !== 'CONFIRMED') throw new AppError('Solo se pueden convertir OC confirmadas', 400);
      if (oc.purchaseId) throw new AppError('Esta OC ya fue convertida a compra', 400);

      // Get next purchase number
      const year    = new Date().getFullYear();
      const count   = await db.purchase.count({ where: { number: { startsWith: `OC-CONV-${year}-` } } });
      const number  = `OC-CONV-${year}-${String(count + 1).padStart(4, '0')}`;

      const itemsTotals = oc.items.reduce(
        (acc, i) => ({
          subtotal:  acc.subtotal  + Number(i.subtotal),
          taxAmount: acc.taxAmount + Number(i.taxAmount),
          total:     acc.total     + Number(i.total),
        }),
        { subtotal: 0, taxAmount: 0, total: 0 }
      );

      // Create Purchase
      const purchase = await db.purchase.create({
        data: {
          type:       'FACTURA_A',
          number,
          supplierId: oc.supplierId,
          userId:     req.user!.userId,
          warehouseId: oc.warehouseId ?? null,
          date:       new Date(),
          currency:   oc.currency as any,
          subtotal:   new Decimal(itemsTotals.subtotal),
          taxAmount:  new Decimal(itemsTotals.taxAmount),
          total:      new Decimal(itemsTotals.total),
          notes:      `Generado desde Orden de Compra ${oc.number}`,
          items: {
            create: oc.items.map((item) => ({
              productId:   item.productId ?? null,
              description: item.description,
              quantity:    new Decimal(Number(item.quantity)),
              unitPrice:   new Decimal(Number(item.unitPrice)),
              taxRate:     new Decimal(Number(item.taxRate)),
              subtotal:    new Decimal(Number(item.subtotal)),
              taxAmount:   new Decimal(Number(item.taxAmount)),
              total:       new Decimal(Number(item.total)),
            })),
          },
        },
      });

      // Auto-stock: create PURCHASE movements if warehouse + productId
      if (oc.warehouseId) {
        const stockRepo = container.resolve<IStockRepository>('StockRepository');
        const itemsWithProduct = oc.items.filter((i) => i.productId);
        for (const item of itemsWithProduct) {
          try {
            await stockRepo.addMovement({
              productId:   item.productId!,
              warehouseId: oc.warehouseId,
              type:        'PURCHASE',
              quantity:    Number(item.quantity),
              reason:      `OC ${oc.number} → Compra ${number}`,
              referenceId: purchase.id,
              userId:      req.user!.userId,
            });
          } catch (stockError) {
            console.error(`Stock movement failed for product ${item.productId}:`, stockError);
          }
        }
      }

      // Mark OC as RECEIVED and link to purchase
      const updated = await repo.update(oc.id, { status: 'RECEIVED', purchaseId: purchase.id } as any);

      await activityRepo.create({
        userId:      req.user!.userId,
        action:      'CREATE',
        entity:      'OrdenCompra',
        entityId:    oc.id,
        description: `OC ${oc.number} convertida a compra ${number}`,
      });

      res.json({ status: 'success', data: { ordenCompra: updated, purchase } });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenCompraRepository>('OrdenCompraRepository');
      const oc   = await repo.findById(req.params.id);
      if (!oc) throw new NotFoundError('Orden de Compra');
      if (oc.status !== 'DRAFT') throw new AppError('Solo se pueden eliminar OC en borrador', 400);
      await repo.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
