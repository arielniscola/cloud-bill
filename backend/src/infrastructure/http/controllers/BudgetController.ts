import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IBudgetRepository } from '../../../domain/repositories/IBudgetRepository';
import { IInvoiceRepository } from '../../../domain/repositories/IInvoiceRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { computeDeliveryStatus } from '../../../shared/utils/deliveryStatus';
import {
  createBudgetSchema,
  updateBudgetSchema,
  updateBudgetStatusSchema,
  budgetQuerySchema,
} from '../../../application/dtos/budget.dto';

export class BudgetController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBudgetRepository>('BudgetRepository');
      const query = budgetQuerySchema.parse(req.query);

      const result = await repo.findAll(
        { page: query.page, limit: query.limit },
        {
          customerId: query.customerId,
          status: query.status,
          type: query.type,
          currency: query.currency,
          dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
          dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
        }
      );

      res.json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBudgetRepository>('BudgetRepository');
      const budget = await repo.findById(req.params.id);
      if (!budget) throw new NotFoundError('Presupuesto');

      const deliveryStatus = await computeDeliveryStatus('budgetId', budget.id, budget.items);

      res.json({ status: 'success', data: { ...budget, deliveryStatus } });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBudgetRepository>('BudgetRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const data = createBudgetSchema.parse(req.body);

      // Calculate totals from items
      let subtotal = 0;
      let taxAmount = 0;
      const items = data.items.map((item) => {
        const itemSubtotal = item.quantity * item.unitPrice;
        const itemTax = itemSubtotal * (item.taxRate / 100);
        subtotal += itemSubtotal;
        taxAmount += itemTax;
        return {
          ...item,
          subtotal: itemSubtotal,
          taxAmount: itemTax,
          total: itemSubtotal + itemTax,
        };
      });

      const budget = await repo.create({
        type: data.type,
        customerId: data.customerId ?? null,
        userId: req.user!.userId,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        currency: data.currency,
        exchangeRate: data.exchangeRate,
        notes: data.notes ?? null,
        subtotal,
        taxAmount,
        total: subtotal + taxAmount,
        items,
      });

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'Budget',
        entityId: budget.id,
        description: `Presupuesto ${budget.number} creado`,
      });

      res.status(201).json({ status: 'success', data: budget });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBudgetRepository>('BudgetRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const budget = await repo.findById(req.params.id);
      if (!budget) throw new NotFoundError('Presupuesto');

      if (budget.status !== 'DRAFT') {
        throw new AppError('Solo se pueden editar presupuestos en borrador', 400);
      }

      const data = updateBudgetSchema.parse(req.body);

      let updateData: any = { ...data };

      if (data.items) {
        let subtotal = 0;
        let taxAmount = 0;
        const items = data.items.map((item) => {
          const itemSubtotal = item.quantity! * item.unitPrice!;
          const itemTax = itemSubtotal * ((item.taxRate ?? 0) / 100);
          subtotal += itemSubtotal;
          taxAmount += itemTax;
          return {
            ...item,
            subtotal: itemSubtotal,
            taxAmount: itemTax,
            total: itemSubtotal + itemTax,
          };
        });
        updateData = { ...updateData, items, subtotal, taxAmount, total: subtotal + taxAmount };
      }

      if (data.validUntil !== undefined) {
        updateData.validUntil = data.validUntil ? new Date(data.validUntil) : null;
      }

      const updated = await repo.update(req.params.id, updateData);

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'Budget',
        entityId: budget.id,
        description: `Presupuesto ${budget.number} actualizado`,
      });

      res.json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBudgetRepository>('BudgetRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const budget = await repo.findById(req.params.id);
      if (!budget) throw new NotFoundError('Presupuesto');

      if (budget.status === 'CONVERTED' || budget.status === 'REJECTED') {
        throw new AppError(`No se puede cambiar el estado de un presupuesto ${budget.status === 'CONVERTED' ? 'convertido' : 'rechazado'}`, 400);
      }

      const { status } = updateBudgetStatusSchema.parse(req.body);
      const updated = await repo.update(req.params.id, { status });

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'Budget',
        entityId: budget.id,
        description: `Presupuesto ${budget.number} actualizado a estado ${status}`,
      });

      res.json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  async convertToInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const budgetRepo = container.resolve<IBudgetRepository>('BudgetRepository');
      const invoiceRepo = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const budget = await budgetRepo.findById(req.params.id);
      if (!budget) throw new NotFoundError('Presupuesto');

      if (budget.status === 'CONVERTED') {
        throw new AppError('El presupuesto ya fue convertido a factura', 400);
      }
      if (budget.status === 'REJECTED' || budget.status === 'EXPIRED') {
        throw new AppError('No se puede convertir un presupuesto rechazado o vencido', 400);
      }
      if (!budget.customerId) {
        throw new AppError('El presupuesto debe tener un cliente para convertirse en factura', 400);
      }

      // Validate all items have a productId
      const itemsWithoutProduct = budget.items.filter((i) => !i.productId);
      if (itemsWithoutProduct.length > 0) {
        throw new AppError(
          'Todos los items del presupuesto deben tener un producto asignado para generar la factura',
          400
        );
      }

      // Determine invoice type from request or use budget's own type
      const invoiceType = req.body.invoiceType || budget.type;

      const invoice = await invoiceRepo.create({
        type: invoiceType,
        customerId: budget.customerId,
        userId: req.user!.userId,
        dueDate: undefined,
        notes: budget.notes ?? undefined,
        currency: budget.currency as any,
        exchangeRate: Number(budget.exchangeRate),
        items: budget.items.map((item) => ({
          productId: item.productId!,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          taxRate: Number(item.taxRate),
        })),
      });

      // Mark budget as CONVERTED and link to invoice
      await budgetRepo.update(req.params.id, {
        status: 'CONVERTED',
        invoiceId: invoice.id,
      });

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'Budget',
        entityId: budget.id,
        description: `Presupuesto ${budget.number} convertido a factura ${invoice.number}`,
      });

      res.status(201).json({ status: 'success', data: invoice });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBudgetRepository>('BudgetRepository');
      const budget = await repo.findById(req.params.id);
      if (!budget) throw new NotFoundError('Presupuesto');

      if (budget.status !== 'DRAFT') {
        throw new AppError('Solo se pueden eliminar presupuestos en borrador', 400);
      }

      await repo.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
