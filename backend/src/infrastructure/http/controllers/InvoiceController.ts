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
import { afipService } from '../../services/AfipService';

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

      const invoice = await invoiceRepository.create({
        type: req.body.type,
        customerId: req.body.customerId,
        userId: req.user!.userId,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
        notes: req.body.notes,
        currency,
        exchangeRate,
        items: req.body.items,
      });

      // Update current account - find or create for this currency
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

      res.json({
        status: 'success',
        data: invoice,
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

      res.json({
        status: 'success',
        ...result,
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

      const invoice = await invoiceRepository.findById(req.params.id);
      if (!invoice) throw new NotFoundError('Invoice');

      if (invoice.status === 'PAID') {
        throw new AppError('La factura ya está pagada', 400);
      }
      if (invoice.status === 'CANCELLED') {
        throw new AppError('No se puede pagar una factura cancelada', 400);
      }
      if (invoice.status === 'DRAFT') {
        throw new AppError('No se puede pagar una factura en borrador, debe emitirse primero', 400);
      }

      const { cashRegisterId } = req.body;
      const cashRegister = await cashRegisterRepository.findById(cashRegisterId);
      if (!cashRegister) throw new AppError('Caja no encontrada', 400);
      if (!cashRegister.isActive) throw new AppError('La caja seleccionada está inactiva', 400);

      // Record payment credit in current account
      const currentAccount = await currentAccountRepository.findByCustomerId(
        invoice.customerId,
        invoice.currency
      );
      if (currentAccount) {
        await currentAccountRepository.addMovement({
          currentAccountId: currentAccount.id,
          type: 'CREDIT',
          amount: invoice.total.toNumber(),
          description: `Pago ${cashRegister.name} - ${invoice.type} ${invoice.number}`,
          invoiceId: invoice.id,
          cashRegisterId,
        });
      }

      const updated = await invoiceRepository.update(req.params.id, { status: 'PAID' });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'PAYMENT',
        entity: 'Invoice',
        entityId: invoice.id,
        description: `Factura ${invoice.number} pagada`,
      });

      res.json({ status: 'success', data: updated });
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

      // Reverse current account movement - use the invoice's currency
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
