import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IBudgetRepository } from '../../../domain/repositories/IBudgetRepository';
import { IInvoiceRepository } from '../../../domain/repositories/IInvoiceRepository';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { ICashRegisterRepository } from '../../../domain/repositories/ICashRegisterRepository';
import { IReciboRepository } from '../../../domain/repositories/IReciboRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { computeDeliveryStatus, computeDeliveryStatusBatch } from '../../../shared/utils/deliveryStatus';
import {
  createBudgetSchema,
  updateBudgetSchema,
  updateBudgetStatusSchema,
  budgetQuerySchema,
} from '../../../application/dtos/budget.dto';
import { createReciboSchema } from '../../../application/dtos/recibo.dto';
import prisma from '../../database/prisma';

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
        saleCondition: data.saleCondition ?? 'CONTADO',
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

      const budgetSaleCondition = (budget as any).saleCondition ?? 'CONTADO';

      const invoice = await invoiceRepo.create({
        type: invoiceType,
        customerId: budget.customerId,
        userId: req.user!.userId,
        dueDate: undefined,
        notes: budget.notes ?? undefined,
        currency: budget.currency as any,
        exchangeRate: Number(budget.exchangeRate),
        saleCondition: budgetSaleCondition,
        items: budget.items.map((item) => ({
          productId: item.productId!,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          taxRate: Number(item.taxRate),
        })),
      });

      // Create account movement if cuenta corriente
      if (budgetSaleCondition === 'CUENTA_CORRIENTE') {
        const currentAccountRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
        let currentAccount = await currentAccountRepo.findByCustomerId(budget.customerId, budget.currency as any);
        if (!currentAccount) {
          currentAccount = await currentAccountRepo.createForCustomer(budget.customerId, budget.currency as any);
        }
        await currentAccountRepo.addMovement({
          currentAccountId: currentAccount.id,
          type: 'DEBIT',
          amount: Number(invoice.total),
          description: `${invoiceType} ${invoice.number} (desde ${budget.number})`,
          invoiceId: invoice.id,
        });
      }

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

  async pay(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const budgetRepo = container.resolve<IBudgetRepository>('BudgetRepository');
      const currentAccountRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
      const cashRegisterRepo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const reciboRepo = container.resolve<IReciboRepository>('ReciboRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const budget = await budgetRepo.findById(req.params.id);
      if (!budget) throw new NotFoundError('Presupuesto');

      if (budget.status === 'REJECTED' || budget.status === 'CONVERTED' || budget.status === 'EXPIRED') {
        throw new AppError('No se puede registrar un pago en este presupuesto', 400);
      }
      if (budget.status === 'PAID') {
        throw new AppError('El presupuesto ya está pagado', 400);
      }

      const paymentData = createReciboSchema.parse(req.body);

      // Validate cash register if provided
      let cashRegisterName = '';
      if (paymentData.cashRegisterId) {
        const cashRegister = await cashRegisterRepo.findById(paymentData.cashRegisterId);
        if (!cashRegister) throw new AppError('Caja no encontrada', 400);
        if (!cashRegister.isActive) throw new AppError('La caja seleccionada está inactiva', 400);
        cashRegisterName = cashRegister.name;
      }

      // Calculate remaining balance
      const activeRecibos = await prisma.recibo.findMany({
        where: { budgetId: budget.id, status: 'EMITTED' },
      });
      const alreadyPaid = activeRecibos.reduce(
        (sum: number, r: any) => sum + Number(r.amount),
        0
      );
      const total = Number(budget.total);
      const remaining = total - alreadyPaid;

      if (paymentData.amount > remaining + 0.001) {
        throw new AppError(`El monto excede el saldo pendiente (${remaining.toFixed(2)})`, 400);
      }

      if (!budget.customerId) {
        throw new AppError('El presupuesto debe tener un cliente para registrar un pago', 400);
      }

      // Create recibo
      const recibo = await reciboRepo.create({
        budgetId: budget.id,
        customerId: budget.customerId,
        userId: req.user!.userId,
        cashRegisterId: paymentData.cashRegisterId ?? null,
        amount: paymentData.amount,
        currency: budget.currency,
        paymentMethod: paymentData.paymentMethod,
        reference: paymentData.reference ?? null,
        bank: paymentData.bank ?? null,
        checkDueDate: paymentData.checkDueDate ? new Date(paymentData.checkDueDate) : null,
        installments: paymentData.installments ?? null,
        notes: paymentData.notes ?? null,
      });

      // Record in current account only for cuenta corriente
      if ((budget as any).saleCondition === 'CUENTA_CORRIENTE') {
        let currentAccount = await currentAccountRepo.findByCustomerId(
          budget.customerId,
          budget.currency as any
        );
        if (!currentAccount) {
          currentAccount = await currentAccountRepo.createForCustomer(
            budget.customerId,
            budget.currency as any
          );
        }
        const movement = await currentAccountRepo.addMovement({
          currentAccountId: currentAccount.id,
          type: 'CREDIT',
          amount: paymentData.amount,
          description: `Pago ${cashRegisterName || paymentData.paymentMethod} - Presupuesto ${budget.number} (${recibo.number})`,
          cashRegisterId: paymentData.cashRegisterId ?? undefined,
        });
        // Link movement to recibo
        if (movement?.id) {
          await prisma.accountMovement.update({
            where: { id: movement.id },
            data: { reciboId: recibo.id },
          });
        }
      }

      // Update budget status
      const newPaid = alreadyPaid + paymentData.amount;
      let newStatus: string;
      if (newPaid >= total - 0.001) {
        newStatus = 'PAID';
      } else {
        newStatus = 'PARTIALLY_PAID';
      }

      const updated = await budgetRepo.update(req.params.id, { status: newStatus as any });

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'PAYMENT',
        entity: 'Budget',
        entityId: budget.id,
        description: `Pago ${recibo.number} registrado en presupuesto ${budget.number}`,
      });

      res.json({ status: 'success', data: updated, recibo });
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
