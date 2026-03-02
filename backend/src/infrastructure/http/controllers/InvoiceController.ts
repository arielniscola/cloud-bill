import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IInvoiceRepository } from '../../../domain/repositories/IInvoiceRepository';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { IStockRepository } from '../../../domain/repositories/IWarehouseRepository';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { Currency } from '../../../shared/types';
import { ICashRegisterRepository } from '../../../domain/repositories/ICashRegisterRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { IAfipConfigRepository } from '../../../domain/repositories/IAfipConfigRepository';
import { IReciboRepository } from '../../../domain/repositories/IReciboRepository';
import { afipService } from '../../services/AfipService';
import { computeDeliveryStatus, computeDeliveryStatusBatch } from '../../../shared/utils/deliveryStatus';
import { createReciboSchema } from '../../../application/dtos/recibo.dto';
import prisma from '../../database/prisma';

export class InvoiceController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceRepository = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const currentAccountRepository = container.resolve<ICurrentAccountRepository>(
        'CurrentAccountRepository'
      );
      const stockRepository = container.resolve<IStockRepository>('StockRepository');
      const warehouseRepository = container.resolve<IWarehouseRepository>('WarehouseRepository');

      const currency: Currency = req.body.currency || 'ARS';
      const exchangeRate: number = req.body.exchangeRate || 1;

      const saleCondition: string = req.body.saleCondition ?? 'CONTADO';

      const invoice = await invoiceRepository.create({
        type: req.body.type,
        customerId: req.body.customerId,
        userId: req.user!.userId,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
        notes: req.body.notes,
        paymentTerms: req.body.paymentTerms ?? null,
        saleCondition,
        currency,
        exchangeRate,
        items: req.body.items,
      });

      // Update current account only for cuenta corriente sales
      if (saleCondition === 'CUENTA_CORRIENTE') {
        let currentAccount = await currentAccountRepository.findByCustomerId(req.body.customerId, currency);
        if (!currentAccount) {
          currentAccount = await currentAccountRepository.createForCustomer(req.body.customerId, currency);
        }
        const isCredit = req.body.type.startsWith('NOTA_CREDITO');
        await currentAccountRepository.addMovement({
          currentAccountId: currentAccount.id,
          type: isCredit ? 'CREDIT' : 'DEBIT',
          amount: invoice.total.toNumber(),
          description: `${req.body.type} ${invoice.number}`,
          invoiceId: invoice.id,
        });
      }

      // Update stock for sales invoices
      if (req.body.type.startsWith('FACTURA')) {
        const defaultWarehouse = await warehouseRepository.findDefault();
        if (defaultWarehouse) {
          for (const item of invoice.items) {
            await stockRepository.addMovement({
              productId: item.productId,
              warehouseId: defaultWarehouse.id,
              type: 'SALE',
              quantity: item.quantity.toNumber(),
              reason: `Invoice ${invoice.number}`,
              referenceId: invoice.id,
              userId: req.user!.userId,
            });
          }
        }
      }

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'Invoice',
        entityId: invoice.id,
        description: `Factura ${invoice.number} creada`,
      });

      res.status(201).json({
        status: 'success',
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceRepository = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const invoice = await invoiceRepository.findById(req.params.id);

      if (!invoice) {
        throw new NotFoundError('Invoice');
      }

      const deliveryStatus = await computeDeliveryStatus('invoiceId', invoice.id, invoice.items);

      res.json({
        status: 'success',
        data: { ...invoice, deliveryStatus },
      });
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceRepository = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const { page, limit, ...filters } = req.query;

      const result = await invoiceRepository.findAll(
        { page: Number(page) || 1, limit: Number(limit) || 10 },
        {
          customerId: filters.customerId as string,
          userId: filters.userId as string,
          status: filters.status as 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED' | 'PARTIALLY_PAID',
          type: filters.type as string as 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C',
          currency: filters.currency as Currency | undefined,
          dateFrom: filters.dateFrom ? new Date(filters.dateFrom as string) : undefined,
          dateTo: filters.dateTo ? new Date(filters.dateTo as string) : undefined,
        }
      );

      const ids = result.data.map((i: any) => i.id);
      const deliveryStatuses = await computeDeliveryStatusBatch('invoiceId', ids);
      const data = result.data.map((i: any) => ({ ...i, deliveryStatus: deliveryStatuses[i.id] }));

      res.json({
        status: 'success',
        ...result,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateDraft(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceRepository = container.resolve<IInvoiceRepository>('InvoiceRepository');

      const existingInvoice = await invoiceRepository.findById(req.params.id);
      if (!existingInvoice) {
        throw new NotFoundError('Invoice');
      }

      if (existingInvoice.status !== 'DRAFT') {
        throw new AppError('Solo se pueden editar facturas en borrador', 400);
      }

      const currency: Currency = req.body.currency || 'ARS';
      const exchangeRate: number = req.body.exchangeRate || 1;

      const invoice = await invoiceRepository.updateWithItems(req.params.id, {
        type: req.body.type,
        customerId: req.body.customerId,
        userId: req.user!.userId,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
        notes: req.body.notes,
        paymentTerms: req.body.paymentTerms ?? null,
        saleCondition: req.body.saleCondition ?? 'CONTADO',
        currency,
        exchangeRate,
        items: req.body.items,
      });

      res.json({
        status: 'success',
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceRepository = container.resolve<IInvoiceRepository>('InvoiceRepository');

      const existingInvoice = await invoiceRepository.findById(req.params.id);
      if (!existingInvoice) {
        throw new NotFoundError('Invoice');
      }

      if (existingInvoice.status === 'CANCELLED') {
        throw new AppError('Cannot modify cancelled invoice', 400);
      }

      const invoice = await invoiceRepository.update(req.params.id, {
        status: req.body.status,
      });

      res.json({
        status: 'success',
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  async pay(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceRepository = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const currentAccountRepository = container.resolve<ICurrentAccountRepository>(
        'CurrentAccountRepository'
      );
      const cashRegisterRepository = container.resolve<ICashRegisterRepository>(
        'CashRegisterRepository'
      );
      const reciboRepository = container.resolve<IReciboRepository>('ReciboRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const invoice = await invoiceRepository.findById(req.params.id);
      if (!invoice) throw new NotFoundError('Invoice');

      if (invoice.status === 'PAID') {
        throw new AppError('La factura ya está pagada', 400);
      }
      if (invoice.status === 'CANCELLED') {
        throw new AppError('No se puede pagar una factura cancelada', 400);
      }

      const paymentData = createReciboSchema.parse(req.body);

      // Validate cash register if provided
      let cashRegisterName = '';
      if (paymentData.cashRegisterId) {
        const cashRegister = await cashRegisterRepository.findById(paymentData.cashRegisterId);
        if (!cashRegister) throw new AppError('Caja no encontrada', 400);
        if (!cashRegister.isActive) throw new AppError('La caja seleccionada está inactiva', 400);
        cashRegisterName = cashRegister.name;
      }

      // Calculate remaining balance
      const activeRecibos = await prisma.recibo.findMany({
        where: { invoiceId: invoice.id, status: 'EMITTED' },
      });
      const alreadyPaid = activeRecibos.reduce(
        (sum: number, r: any) => sum + Number(r.amount),
        0
      );
      const total = Number(invoice.total);
      const remaining = total - alreadyPaid;

      if (paymentData.amount > remaining + 0.001) {
        throw new AppError(`El monto excede el saldo pendiente (${remaining.toFixed(2)})`, 400);
      }

      // Create recibo
      const recibo = await reciboRepository.create({
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        userId: req.user!.userId,
        cashRegisterId: paymentData.cashRegisterId ?? null,
        amount: paymentData.amount,
        currency: invoice.currency,
        paymentMethod: paymentData.paymentMethod,
        reference: paymentData.reference ?? null,
        bank: paymentData.bank ?? null,
        checkDueDate: paymentData.checkDueDate ? new Date(paymentData.checkDueDate) : null,
        installments: paymentData.installments ?? null,
        notes: paymentData.notes ?? null,
      });

      // Record payment in current account only for cuenta corriente
      if ((invoice as any).saleCondition === 'CUENTA_CORRIENTE') {
        const currentAccount = await currentAccountRepository.findByCustomerId(
          invoice.customerId,
          invoice.currency
        );
        if (currentAccount) {
          const movement = await currentAccountRepository.addMovement({
            currentAccountId: currentAccount.id,
            type: 'CREDIT',
            amount: paymentData.amount,
            description: `Pago ${cashRegisterName || paymentData.paymentMethod} - ${invoice.type} ${invoice.number} (${recibo.number})`,
            invoiceId: invoice.id,
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
      }

      // Update invoice status
      const newPaid = alreadyPaid + paymentData.amount;
      let newStatus: 'PAID' | 'PARTIALLY_PAID' | 'ISSUED';
      if (newPaid >= total - 0.001) {
        newStatus = 'PAID';
      } else {
        newStatus = 'PARTIALLY_PAID';
      }

      const updated = await invoiceRepository.update(req.params.id, { status: newStatus });

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'PAYMENT',
        entity: 'Invoice',
        entityId: invoice.id,
        description: `Pago ${recibo.number} registrado en factura ${invoice.number}`,
      });

      res.json({ status: 'success', data: updated, recibo });
    } catch (error) {
      next(error);
    }
  }

  async emit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceRepo = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const afipRepo = container.resolve<IAfipConfigRepository>('AfipConfigRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const invoice = await invoiceRepo.findById(req.params.id);
      if (!invoice) throw new NotFoundError('Invoice');

      if (invoice.status !== 'DRAFT') {
        throw new AppError('Solo se pueden emitir facturas en estado DRAFT', 400);
      }

      if (invoice.cae) {
        throw new AppError('Esta factura ya tiene CAE asignado', 400);
      }

      const config = await afipRepo.getActive();
      if (!config) {
        throw new AppError('No hay configuración AFIP activa. Configure ARCA en Configuración.', 400);
      }

      const result = await afipService.emitInvoice(invoice as any, config);

      const updated = await invoiceRepo.update(req.params.id, {
        cae: result.cae,
        caeExpiry: result.caeExpiry,
        afipCbtNum: result.afipCbtNum,
        afipPtVenta: result.afipPtVenta,
        status: 'ISSUED',
      });

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'AfipEmission',
        entityId: invoice.id,
        description: `CAE emitido para factura ${invoice.number}: ${result.cae}`,
        metadata: { cae: result.cae, caeExpiry: result.caeExpiry, afipCbtNum: result.afipCbtNum },
      });

      res.json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceRepository = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const currentAccountRepository = container.resolve<ICurrentAccountRepository>(
        'CurrentAccountRepository'
      );

      const existingInvoice = await invoiceRepository.findById(req.params.id);
      if (!existingInvoice) {
        throw new NotFoundError('Invoice');
      }

      if (existingInvoice.status === 'CANCELLED') {
        throw new AppError('Invoice is already cancelled', 400);
      }

      // Reverse current account movement only for cuenta corriente
      if ((existingInvoice as any).saleCondition === 'CUENTA_CORRIENTE') {
        const currentAccount = await currentAccountRepository.findByCustomerId(
          existingInvoice.customerId,
          existingInvoice.currency
        );
        if (currentAccount) {
          const wasCredit = existingInvoice.type.startsWith('NOTA_CREDITO');
          await currentAccountRepository.addMovement({
            currentAccountId: currentAccount.id,
            type: wasCredit ? 'DEBIT' : 'CREDIT',
            amount: existingInvoice.total.toNumber(),
            description: `Cancelled: ${existingInvoice.type} ${existingInvoice.number}`,
            invoiceId: existingInvoice.id,
          });
        }
      }

      const invoice = await invoiceRepository.update(req.params.id, {
        status: 'CANCELLED',
      });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CANCEL',
        entity: 'Invoice',
        entityId: existingInvoice.id,
        description: `Factura ${existingInvoice.number} cancelada`,
      });

      res.json({
        status: 'success',
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }
}
