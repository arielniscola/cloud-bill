import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IReciboRepository } from '../../../domain/repositories/IReciboRepository';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { IInvoiceRepository } from '../../../domain/repositories/IInvoiceRepository';
import { IBudgetRepository } from '../../../domain/repositories/IBudgetRepository';
import { IOrdenPedidoRepository } from '../../../domain/repositories/IOrdenPedidoRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { ICashRegisterRepository } from '../../../domain/repositories/ICashRegisterRepository';
import { IStockRepository, IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { reciboQuerySchema, reciboCheckQuerySchema, updateCheckStatusSchema } from '../../../application/dtos/recibo.dto';
import { recordChequeBounceMovement } from '../../services/ChequeBounceService';
import { resolveSaleWarehouse } from '../../../shared/utils/saleWarehouse';
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
          ordenPedidoId: (query as any).ordenPedidoId,
          customerId: query.customerId,
          status: query.status,
          paymentMethod: query.paymentMethod,
          companyId: req.companyId,
          fiscalMode: req.fiscalMode,
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
      const recibo = await repo.findById(req.params.id, req.companyId);
      if (!recibo) throw new NotFoundError('Recibo');

      res.json({ status: 'success', data: recibo });
    } catch (error) {
      next(error);
    }
  }

  async findChecks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IReciboRepository>('ReciboRepository');
      const query = reciboCheckQuerySchema.parse(req.query);

      const result = await repo.findChecks(
        { page: query.page, limit: query.limit },
        {
          customerId: query.customerId,
          checkStatus: query.checkStatus,
          dueDateFrom: query.dueDateFrom ? new Date(query.dueDateFrom) : undefined,
          dueDateTo: query.dueDateTo ? new Date(query.dueDateTo) : undefined,
          dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
          dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
          companyId: req.companyId,
        } as any
      );

      res.json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  }

  async updateCheckStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IReciboRepository>('ReciboRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const recibo = await repo.findById(req.params.id, req.companyId);
      if (!recibo) throw new NotFoundError('Recibo');
      if (recibo.paymentMethod !== 'CHECK') throw new AppError('Solo se puede cambiar el estado de cheques', 400);
      if (recibo.status === 'CANCELLED') throw new AppError('El recibo está cancelado', 400);

      const oldStatus = (recibo as any).checkStatus;
      const { checkStatus } = updateCheckStatusSchema.parse(req.body);
      const updated = await repo.updateCheckStatus(req.params.id, checkStatus);

      // Débito interno al cliente cuando el cheque de cobranza se rechaza
      // (y reversión si se vuelve atrás desde Rechazado).
      const enteringBounced = checkStatus === 'BOUNCED' && oldStatus !== 'BOUNCED';
      const leavingBounced  = oldStatus === 'BOUNCED' && checkStatus !== 'BOUNCED';
      if ((enteringBounced || leavingBounced) && (recibo as any).customerId) {
        await recordChequeBounceMovement({
          customerId: (recibo as any).customerId,
          amount:     Number((recibo as any).amount),
          currency:   (recibo as any).currency ?? 'ARS',
          reference:  (recibo as any).reference || recibo.number,
          direction:  enteringBounced ? 'DEBIT' : 'CREDIT',
          companyId:  req.companyId!,
          fiscalMode: req.fiscalMode,
        });
      }

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'Recibo',
        entityId: recibo.id,
        description: enteringBounced
          ? `Cheque ${recibo.number} rechazado — débito al cliente`
          : `Cheque ${recibo.number} actualizado a estado ${checkStatus}`,
      });

      res.json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  /** Deposit a check to a cash register: link cashRegisterId + set DEPOSITED + create cash movement */
  async depositCheckToCash(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reciboRepo  = container.resolve<IReciboRepository>('ReciboRepository');
      const cashRepo    = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const logRepo     = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      const currentAccountRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');

      const recibo = await reciboRepo.findById(req.params.id, req.companyId);
      if (!recibo) throw new NotFoundError('Recibo');
      if ((recibo as any).paymentMethod !== 'CHECK') throw new AppError('El recibo no es de tipo cheque', 400);
      if ((recibo as any).status === 'CANCELLED')    throw new AppError('El recibo está cancelado', 400);
      if ((recibo as any).checkStatus === 'CLEARED') throw new AppError('El cheque ya fue acreditado', 400);

      const { cashRegisterId } = req.body as { cashRegisterId: string };
      if (!cashRegisterId) throw new AppError('cashRegisterId requerido', 400);
      const cashRegister = await cashRepo.findById(cashRegisterId);
      if (!cashRegister) throw new NotFoundError('Caja');

      // Link recibo to cash register + set DEPOSITED
      await prisma.$executeRaw`
        UPDATE recibos SET "cashRegisterId" = ${cashRegisterId}, "checkStatus" = 'DEPOSITED', "updatedAt" = NOW()
        WHERE id = ${req.params.id}
      `;

      // Create or update the cash register AccountMovement
      const existingMovement = await prisma.accountMovement.findFirst({
        where: { reciboId: recibo.id },
      });

      if (existingMovement) {
        // Movement already exists (CUENTA_CORRIENTE): just attach the cashRegisterId
        await prisma.accountMovement.update({
          where: { id: existingMovement.id },
          data: { cashRegisterId },
        });
      } else {
        // No movement yet (CONTADO): find or create current account and create CREDIT movement
        const customerId = (recibo as any).customerId;
        const currency   = (recibo as any).currency ?? 'ARS';
        let currentAccount = await currentAccountRepo.findByCustomerId(customerId, currency, req.fiscalMode);
        if (!currentAccount) {
          currentAccount = await currentAccountRepo.createForCustomer(customerId, currency, undefined, req.fiscalMode);
        }
        const movement = await currentAccountRepo.addMovement({
          currentAccountId: currentAccount.id,
          type: 'CREDIT',
          amount: Number((recibo as any).amount),
          description: `Depósito cheque ${(recibo as any).number} en caja ${cashRegister.name}`,
          invoiceId: (recibo as any).invoiceId ?? undefined,
          cashRegisterId,
        });
        if (movement?.id) {
          await prisma.accountMovement.update({
            where: { id: movement.id },
            data: { reciboId: recibo.id },
          });
        }
      }

      await logRepo.create({
        userId:      req.user!.userId,
        action:      'UPDATE',
        entity:      'Recibo',
        entityId:    recibo.id,
        description: `Cheque ${(recibo as any).number} depositado en caja ${cashRegister.name}`,
      });

      const updated = await reciboRepo.findById(req.params.id, req.companyId);
      res.json({ status: 'success', data: updated });
    } catch (error) { next(error); }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reciboRepo = container.resolve<IReciboRepository>('ReciboRepository');
      const currentAccountRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
      const invoiceRepo = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const budgetRepo = container.resolve<IBudgetRepository>('BudgetRepository');
      const opRepo = container.resolve<IOrdenPedidoRepository>('OrdenPedidoRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const recibo = await reciboRepo.findById(req.params.id, req.companyId);
      if (!recibo) throw new NotFoundError('Recibo');

      if (recibo.status === 'CANCELLED') {
        throw new AppError('El recibo ya está cancelado', 400);
      }

      // Lecturas previas (no necesitan la transacción)
      const accountMovement = await prisma.accountMovement.findFirst({
        where: { reciboId: recibo.id },
        include: { currentAccount: true },
      });

      // Si es la devolución de una Nota de Crédito que estaba totalmente devuelta,
      // la mercadería ya había reingresado al stock (RETURN al llegar a PAID).
      // Al anular la devolución hay que sacar nuevamente ese stock.
      let ncInvoice: Awaited<ReturnType<IInvoiceRepository['findById']>> = null;
      let ncWarehouse: { id: string } | null = null;
      if (recibo.invoiceId) {
        const invoice = await invoiceRepo.findById(recibo.invoiceId);
        if (invoice && invoice.type.startsWith('NOTA_CREDITO') && invoice.status === 'PAID') {
          ncInvoice = invoice;
          // Mismo depósito al que reingresó la devolución (el de la factura de origen).
          ncWarehouse = await resolveSaleWarehouse(
            'invoices',
            (invoice as any).originInvoiceId ?? invoice.id,
            (invoice as any).companyId
          );
        }
      }

      // Reversa de cuenta corriente + stock + estado del recibo: todo o nada.
      // Los recálculos de estados (factura/presupuesto/orden) van después del
      // commit porque releen los recibos ya confirmados.
      let cancelled!: Awaited<ReturnType<IReciboRepository['cancel']>>;
      await prisma.$transaction(async (tx) => {
        // Reverse the AccountMovement linked to this recibo
        if (accountMovement) {
          await currentAccountRepo.addMovement({
            currentAccountId: accountMovement.currentAccount.id,
            type: accountMovement.type === 'CREDIT' ? 'DEBIT' : 'CREDIT',
            amount: Number(accountMovement.amount),
            description: `Anulación recibo ${recibo.number}`,
            invoiceId: recibo.invoiceId ?? undefined,
            cashRegisterId: recibo.cashRegisterId ?? undefined,
          }, tx);
        }

        if (ncInvoice && ncWarehouse) {
          const stockRepo = container.resolve<IStockRepository>('StockRepository');
          for (const item of ncInvoice.items) {
            if (!item.productId) continue;
            await stockRepo.addMovement({
              productId: item.productId,
              variantId: (item as any).variantId ?? null,
              warehouseId: ncWarehouse.id,
              type: 'ADJUSTMENT_OUT',
              quantity: item.quantity.toNumber(),
              reason: `Anulación devolución NC ${ncInvoice.number}`,
              referenceId: ncInvoice.id,
              userId: req.user!.userId,
            }, tx);
          }
        }

        // Cancel the recibo
        cancelled = await reciboRepo.cancel(recibo.id, tx);
      }, { timeout: 30000 });

      // Recalculate invoice status
      if (recibo.invoiceId) {
        await this._recalculateInvoiceStatus(recibo.invoiceId, invoiceRepo);
      }

      // Recalculate budget status
      if (recibo.budgetId) {
        await this._recalculateBudgetStatus(recibo.budgetId, budgetRepo);
      }

      // Recalculate orden pedido status
      if ((recibo as any).ordenPedidoId) {
        await this._recalculateOrdenPedidoStatus((recibo as any).ordenPedidoId, opRepo);
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
      // Reverting to a non-paid state: AUTHORIZED if the invoice has CAE (FORMAL), else ISSUED.
      newStatus = invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID'
        ? ((invoice as any).cae ? 'AUTHORIZED' : 'ISSUED')
        : invoice.status;
    }

    await invoiceRepo.update(invoiceId, { status: newStatus as any });
  }

  private async _recalculateOrdenPedidoStatus(
    ordenPedidoId: string,
    opRepo: IOrdenPedidoRepository
  ): Promise<void> {
    const op = await opRepo.findById(ordenPedidoId);
    if (!op || op.status === 'CANCELLED' || op.status === 'CONVERTED') return;

    const activeRecibos = await prisma.recibo.findMany({
      where: { ordenPedidoId, status: 'EMITTED' } as any,
    });

    const paidAmount = activeRecibos.reduce(
      (sum: number, r: any) => sum + Number(r.amount),
      0
    );
    const total = Number(op.total);

    let newStatus: string;
    if (paidAmount >= total) {
      newStatus = 'PAID';
    } else if (paidAmount > 0) {
      newStatus = 'PARTIALLY_PAID';
    } else {
      newStatus = op.status === 'PAID' || op.status === 'PARTIALLY_PAID'
        ? 'CONFIRMED'
        : op.status;
    }

    await opRepo.update(ordenPedidoId, { status: newStatus as any });
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
