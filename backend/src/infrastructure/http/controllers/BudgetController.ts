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
import { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';

/**
 * Marca como EXPIRED los presupuestos cuyo validUntil ya pasó. Solo aplica a
 * estados abiertos (DRAFT/SENT): un presupuesto aceptado, convertido o cobrado
 * no vence solo. Corre al listar/consultar — un único UPDATE masivo, sin
 * recálculo por fila.
 */
async function expireOverdueBudgets(companyId?: string, budgetId?: string): Promise<void> {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`"validUntil" IS NOT NULL`,
    Prisma.sql`"validUntil" < NOW()`,
    Prisma.sql`status::text IN ('DRAFT', 'SENT')`,
  ];
  if (companyId) conditions.push(Prisma.sql`"companyId" = ${companyId}`);
  if (budgetId) conditions.push(Prisma.sql`id = ${budgetId}`);
  await prisma.$executeRaw`
    UPDATE "budgets" SET status = 'EXPIRED'::"BudgetStatus", "updatedAt" = NOW()
    WHERE ${Prisma.join(conditions, ' AND ')}
  `;
}

export class BudgetController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBudgetRepository>('BudgetRepository');
      const query = budgetQuerySchema.parse(req.query);

      await expireOverdueBudgets(req.companyId);

      const result = await repo.findAll(
        { page: query.page, limit: query.limit },
        {
          customerId: query.customerId,
          status: query.status,
          type: query.type,
          currency: query.currency,
          companyId: req.companyId,
          fiscalMode: req.fiscalMode,
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
      await expireOverdueBudgets(req.companyId, req.params.id);
      const budget = await repo.findById(req.params.id, req.companyId);
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

      // Calculate totals from items — Factura C does not carry IVA
      const isTypeC = data.type.endsWith('_C');
      let subtotal = 0;
      let taxAmount = 0;
      const items = data.items.map((item) => {
        const itemSubtotal = item.quantity * item.unitPrice;
        const itemTax = isTypeC ? 0 : itemSubtotal * (item.taxRate / 100);
        subtotal += itemSubtotal;
        taxAmount += itemTax;
        return {
          ...item,
          taxRate: isTypeC ? 0 : item.taxRate,
          subtotal: itemSubtotal,
          taxAmount: itemTax,
          total: itemSubtotal + itemTax,
        };
      });

      const budget = await repo.create({
        type: data.type,
        customerId: data.customerId ?? null,
        userId: req.user!.userId,
        companyId: req.companyId,
        fiscalMode: req.fiscalMode,
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

      const budget = await repo.findById(req.params.id, req.companyId);
      if (!budget) throw new NotFoundError('Presupuesto');

      if (budget.status !== 'DRAFT') {
        throw new AppError('Solo se pueden editar presupuestos en borrador', 400);
      }

      const data = updateBudgetSchema.parse(req.body);

      let updateData: any = { ...data };

      if (data.items) {
        // Factura C does not carry IVA — fall back to the existing type when not edited
        const isTypeC = (data.type ?? budget.type).endsWith('_C');
        let subtotal = 0;
        let taxAmount = 0;
        const items = data.items.map((item) => {
          const itemSubtotal = item.quantity! * item.unitPrice!;
          const itemTax = isTypeC ? 0 : itemSubtotal * ((item.taxRate ?? 0) / 100);
          subtotal += itemSubtotal;
          taxAmount += itemTax;
          return {
            ...item,
            taxRate: isTypeC ? 0 : item.taxRate,
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

      const budget = await repo.findById(req.params.id, req.companyId);
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
      const budget = await repo.findById(req.params.id, req.companyId);
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
      const { to, pdfBase64 } = req.body;
      if (!to || typeof to !== 'string') throw new AppError('Destinatario requerido', 400);
      await sendBudgetEmail(id, to, req.companyId!, pdfBase64);
      res.json({ status: 'success', message: 'Correo enviado correctamente' });
    } catch (error) {
      next(error);
    }
  };
}
