import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IReciboRepository } from '../../../domain/repositories/IReciboRepository';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { IInvoiceRepository } from '../../../domain/repositories/IInvoiceRepository';
import { IBudgetRepository } from '../../../domain/repositories/IBudgetRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { reciboQuerySchema } from '../../../application/dtos/recibo.dto';
import prisma from '../../database/prisma';

export class ReciboController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IReciboRepository>('ReciboRepository');
      const query = reciboQuerySchema.parse(req.query);

      const result = await repo.findAll(
        { page: query.page, limit: query.limit },
        {
          invoiceId: query.invoiceId,
          budgetId: query.budgetId,
          customerId: query.customerId,
          status: query.status,
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
      const repo = container.resolve<IReciboRepository>('ReciboRepository');
      const recibo = await repo.findById(req.params.id);
      if (!recibo) throw new NotFoundError('Recibo');

      res.json({ status: 'success', data: recibo });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reciboRepo = container.resolve<IReciboRepository>('ReciboRepository');
      const currentAccountRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
      const invoiceRepo = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const budgetRepo = container.resolve<IBudgetRepository>('BudgetRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const recibo = await reciboRepo.findById(req.params.id);
      if (!recibo) throw new NotFoundError('Recibo');

      if (recibo.status === 'CANCELLED') {
        throw new AppError('El recibo ya está cancelado', 400);
      }

      // Reverse the AccountMovement linked to this recibo
      const accountMovement = await prisma.accountMovement.findFirst({
        where: { reciboId: recibo.id },
        include: { currentAccount: true },
      });

      if (accountMovement) {
        const currentAccount = accountMovement.currentAccount;
        await currentAccountRepo.addMovement({
          currentAccountId: currentAccount.id,
          type: accountMovement.type === 'CREDIT' ? 'DEBIT' : 'CREDIT',
          amount: Number(accountMovement.amount),
          description: `Anulación recibo ${recibo.number}`,
          invoiceId: recibo.invoiceId ?? undefined,
          cashRegisterId: recibo.cashRegisterId ?? undefined,
        });
      }

      // Cancel the recibo
      const cancelled = await reciboRepo.cancel(recibo.id);

      // Recalculate invoice status
      if (recibo.invoiceId) {
        await this._recalculateInvoiceStatus(recibo.invoiceId, invoiceRepo);
      }

      // Recalculate budget status
      if (recibo.budgetId) {
        await this._recalculateBudgetStatus(recibo.budgetId, budgetRepo);
      }

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CANCEL',
        entity: 'Recibo',
        entityId: recibo.id,
        description: `Recibo ${recibo.number} cancelado`,
      });

      res.json({ status: 'success', data: cancelled });
    } catch (error) {
      next(error);
    }
  }

  private async _recalculateInvoiceStatus(
    invoiceId: string,
    invoiceRepo: IInvoiceRepository
  ): Promise<void> {
    const invoice = await invoiceRepo.findById(invoiceId);
    if (!invoice || invoice.status === 'CANCELLED') return;

    const activeRecibos = await prisma.recibo.findMany({
      where: { invoiceId, status: 'EMITTED' },
    });

    const paidAmount = activeRecibos.reduce(
      (sum: number, r: any) => sum + Number(r.amount),
      0
    );
    const total = Number(invoice.total);

    let newStatus: string;
    if (paidAmount >= total) {
      newStatus = 'PAID';
    } else if (paidAmount > 0) {
      newStatus = 'PARTIALLY_PAID';
    } else {
      newStatus = invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID'
        ? 'ISSUED'
        : invoice.status;
    }

    await invoiceRepo.update(invoiceId, { status: newStatus as any });
  }

  private async _recalculateBudgetStatus(
    budgetId: string,
    budgetRepo: IBudgetRepository
  ): Promise<void> {
    const budget = await budgetRepo.findById(budgetId);
    if (!budget || budget.status === 'CONVERTED' || budget.status === 'REJECTED') return;

    const activeRecibos = await prisma.recibo.findMany({
      where: { budgetId, status: 'EMITTED' },
    });

    const paidAmount = activeRecibos.reduce(
      (sum: number, r: any) => sum + Number(r.amount),
      0
    );
    const total = Number(budget.total);

    let newStatus: string;
    if (paidAmount >= total) {
      newStatus = 'PAID';
    } else if (paidAmount > 0) {
      newStatus = 'PARTIALLY_PAID';
    } else {
      newStatus = budget.status === 'PAID' || budget.status === 'PARTIALLY_PAID'
        ? 'ACCEPTED'
        : budget.status;
    }

    await budgetRepo.update(budgetId, { status: newStatus as any });
  }
}
