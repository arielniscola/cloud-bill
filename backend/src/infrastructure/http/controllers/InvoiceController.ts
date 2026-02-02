import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IInvoiceRepository } from '../../../domain/repositories/IInvoiceRepository';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { IStockRepository } from '../../../domain/repositories/IWarehouseRepository';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';

export class InvoiceController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceRepository = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const currentAccountRepository = container.resolve<ICurrentAccountRepository>(
        'CurrentAccountRepository'
      );
      const stockRepository = container.resolve<IStockRepository>('StockRepository');
      const warehouseRepository = container.resolve<IWarehouseRepository>('WarehouseRepository');

      const invoice = await invoiceRepository.create({
        type: req.body.type,
        customerId: req.body.customerId,
        userId: req.user!.userId,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
        notes: req.body.notes,
        items: req.body.items,
      });

      // Update current account
      const currentAccount = await currentAccountRepository.findByCustomerId(req.body.customerId);
      if (currentAccount) {
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

      res.status(201).json({
        status: 'success',
        data: { invoice },
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
        data: { invoice },
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
          dateFrom: filters.dateFrom ? new Date(filters.dateFrom as string) : undefined,
          dateTo: filters.dateTo ? new Date(filters.dateTo as string) : undefined,
        }
      );

      res.json({
        status: 'success',
        data: result,
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
        data: { invoice },
      });
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

      // Reverse current account movement
      const currentAccount = await currentAccountRepository.findByCustomerId(
        existingInvoice.customerId
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

      res.json({
        status: 'success',
        data: { invoice },
      });
    } catch (error) {
      next(error);
    }
  }
}
