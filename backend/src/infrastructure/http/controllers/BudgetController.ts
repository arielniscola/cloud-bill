import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IBudgetRepository } from '../../../domain/repositories/IBudgetRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { ICustomerRepository } from '../../../domain/repositories/ICustomerRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { computeDeliveryStatus, computeDeliveryStatusBatch } from '../../../shared/utils/deliveryStatus';
import { sendBudgetEmail } from '../../services/EmailService';
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

      const ids = result.data.map((b: any) => b.id);
      const deliveryStatuses = await computeDeliveryStatusBatch('budgetId', ids);
      const data = result.data.map((b: any) => ({ ...b, deliveryStatus: deliveryStatuses[b.id] }));

      res.json({ status: 'success', ...result, data });
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

      if (data.customerId) {
        const customerRepo = container.resolve<ICustomerRepository>('CustomerRepository');
        const customer = await customerRepo.findById(data.customerId);
        if (!customer) throw new NotFoundError('Cliente');
        if (!customer.isActive) throw new AppError('El cliente está inactivo y no puede recibir nuevos presupuestos', 400);
      }

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
        paymentTerms: data.paymentTerms ?? null,
        subtotal,
        taxAmount,
        total: subtotal + taxAmount,
        items,
      } as any);

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

  sendEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { to } = req.body;
      if (!to || typeof to !== 'string') throw new Error('Destinatario requerido');
      await sendBudgetEmail(id, to);
      res.json({ status: 'success', message: 'Correo enviado correctamente' });
    } catch (error) {
      next(error);
    }
  };
}
