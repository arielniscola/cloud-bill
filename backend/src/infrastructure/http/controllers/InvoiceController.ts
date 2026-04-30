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
import { ICustomerRepository } from '../../../domain/repositories/ICustomerRepository';
import { afipService } from '../../services/AfipService';
import { pdvService } from '../../services/PdvService';
import { sendInvoiceEmail } from '../../services/EmailService';
import { saveAfipError } from '../../../shared/utils/saveAfipError';
import { computeDeliveryStatus, computeDeliveryStatusBatch } from '../../../shared/utils/deliveryStatus';
import { createReciboSchema } from '../../../application/dtos/recibo.dto';
import prisma from '../../database/prisma';
import { recordInvoiceCreated, recordPaymentReceived } from '../../services/AccountingService';

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

      if (req.body.customerId) {
        const customerRepo = container.resolve<ICustomerRepository>('CustomerRepository');
        const customer = await customerRepo.findById(req.body.customerId);
        if (!customer) throw new NotFoundError('Cliente');
        if (!customer.isActive) throw new AppError('El cliente está inactivo y no puede recibir nuevas facturas', 400);
      }

      const invoice = await invoiceRepository.create({
        type: req.body.type,
        customerId: req.body.customerId,
        userId: req.user!.userId,
        companyId: req.companyId,
        fiscalMode: req.fiscalMode,
        date: req.body.date ? new Date(req.body.date) : undefined,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
        notes: req.body.notes,
        paymentTerms: req.body.paymentTerms ?? null,
        saleCondition,
        stockBehavior: req.body.stockBehavior ?? 'DISCOUNT',
        originInvoiceId: req.body.originInvoiceId ?? null,
        currency,
        exchangeRate,
        items: req.body.items,
      } as any);

      // Update current account only for cuenta corriente sales
      if (saleCondition === 'CUENTA_CORRIENTE') {
        let currentAccount = await currentAccountRepository.findByCustomerId(req.body.customerId, currency, req.fiscalMode);
        if (!currentAccount) {
          currentAccount = await currentAccountRepository.createForCustomer(req.body.customerId, currency, undefined, req.fiscalMode);
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
        const stockBehavior: string = req.body.stockBehavior ?? 'DISCOUNT';
        const defaultWarehouse = await warehouseRepository.findDefault(req.companyId);
        if (defaultWarehouse) {
          if (stockBehavior === 'RESERVE') {
            // Reserve stock (increment reservedQuantity)
            for (const item of invoice.items) {
              await prisma.stock.upsert({
                where: { productId_warehouseId: { productId: item.productId, warehouseId: defaultWarehouse.id } },
                update: { reservedQuantity: { increment: item.quantity } },
                create: { productId: item.productId, warehouseId: defaultWarehouse.id, quantity: 0, reservedQuantity: item.quantity },
              });
            }
          } else {
            // DISCOUNT: create SALE movement (immediate deduction)
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
      }

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'Invoice',
        entityId: invoice.id,
        description: `Factura ${invoice.number} creada`,
      });

      // Auto-generate journal entry
      await recordInvoiceCreated({
        id: invoice.id,
        number: invoice.number,
        type: invoice.type,
        subtotal: Number(invoice.subtotal),
        taxAmount: Number(invoice.taxAmount),
        total: Number(invoice.total),
        companyId: req.companyId,
        userId: req.user!.userId,
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

      // Auto-heal: if invoice came from an OP and is still DRAFT, recalculate status from recibos
      const opId = (invoice as any).ordenPedidoId;
      if (opId && invoice.status === 'DRAFT') {
        // Find recibos linked directly to this invoice
        const linked = await (prisma as any).recibo.findMany({
          where: { invoiceId: invoice.id, status: 'EMITTED' },
        });
        // Also find recibos still linked only to the OP (not yet migrated to the invoice)
        const opOnly = await (prisma as any).recibo.findMany({
          where: { ordenPedidoId: opId, invoiceId: null, status: 'EMITTED' },
        });

        // Link any OP-only recibos to this invoice
        if (opOnly.length > 0) {
          for (const r of opOnly) {
            await (prisma as any).recibo.update({
              where: { id: r.id },
              data: { invoiceId: invoice.id },
            });
          }
        }

        const allRecibos = [...linked, ...opOnly];
        if (allRecibos.length > 0) {
          const totalPaid = allRecibos.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
          const invoiceTotal = Number(invoice.total);
          const newStatus = totalPaid >= invoiceTotal - 0.001 ? 'PAID' : 'PARTIALLY_PAID';
          await invoiceRepository.update(invoice.id, { status: newStatus as any });
          (invoice as any).status = newStatus;
        }
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
          status: filters.status as 'DRAFT' | 'ISSUED' | 'AUTHORIZED' | 'PAID' | 'CANCELLED' | 'PARTIALLY_PAID',
          type: filters.type as string as 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C',
          currency: filters.currency as Currency | undefined,
          saleCondition: filters.saleCondition as string | undefined,
          companyId: req.companyId,
          fiscalMode: req.fiscalMode,
          dateFrom: filters.dateFrom ? new Date(filters.dateFrom as string) : undefined,
          dateTo: filters.dateTo ? new Date(filters.dateTo as string) : undefined,
        }
      );

      const ids = result.data.map((i: any) => i.id);
      const deliveryStatuses = await computeDeliveryStatusBatch('invoiceId', ids);

      // Auto-heal: recalculate status for any DRAFT invoices that came from a paid OP
      const draftOpInvoices = result.data.filter((i: any) => i.status === 'DRAFT' && (i as any).ordenPedidoId);
      if (draftOpInvoices.length > 0) {
        for (const inv of draftOpInvoices) {
          const opId = (inv as any).ordenPedidoId;
          const linked = await (prisma as any).recibo.findMany({
            where: { invoiceId: inv.id, status: 'EMITTED' },
          });
          const opOnly = await (prisma as any).recibo.findMany({
            where: { ordenPedidoId: opId, invoiceId: null, status: 'EMITTED' },
          });
          if (opOnly.length > 0) {
            for (const r of opOnly) {
              await (prisma as any).recibo.update({ where: { id: r.id }, data: { invoiceId: inv.id } });
            }
          }
          const allRecibos = [...linked, ...opOnly];
          if (allRecibos.length > 0) {
            const totalPaid = allRecibos.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
            const invoiceTotal = Number(inv.total);
            const newStatus = totalPaid >= invoiceTotal - 0.001 ? 'PAID' : 'PARTIALLY_PAID';
            await invoiceRepository.update(inv.id, { status: newStatus as any });
            (inv as any).status = newStatus;
          }
        }
      }

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
        originInvoiceId: req.body.originInvoiceId ?? null,
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

      // CHECK and BANK_TRANSFER don't use a cash register
      const isCheck = paymentData.paymentMethod === 'CHECK';
      const isBankTransfer = paymentData.paymentMethod === 'BANK_TRANSFER';
      const usesCaja = !isCheck && !isBankTransfer;

      // Create recibo
      const recibo = await reciboRepository.create({
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        userId: req.user!.userId,
        cashRegisterId: usesCaja ? (paymentData.cashRegisterId ?? null) : null,
        bankAccountId: isBankTransfer ? ((paymentData as any).bankAccountId ?? null) : null,
        amount: paymentData.amount,
        currency: invoice.currency,
        paymentMethod: paymentData.paymentMethod,
        reference: paymentData.reference ?? null,
        bank: paymentData.bank ?? null,
        checkDueDate: paymentData.checkDueDate ? new Date(paymentData.checkDueDate) : null,
        installments: paymentData.installments ?? null,
        notes: paymentData.notes ?? null,
        companyId: req.companyId,
        fiscalMode: ((invoice as any).fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL',
      } as any);

      // For BANK_TRANSFER with a bankAccountId, create a bank movement
      if (isBankTransfer && (paymentData as any).bankAccountId) {
        const exchangeRate = Number((invoice as any).exchangeRate ?? 1);
        const amountARS = invoice.currency !== 'ARS' ? paymentData.amount * exchangeRate : paymentData.amount;
        const customerName = (invoice as any).customer?.name ?? '';
        const bankDescription = `Cobro ${invoice.type} ${invoice.number}${customerName ? ` - ${customerName}` : ''} (${recibo.number})`;
        await (prisma as any).bankMovement.create({
          data: {
            bankAccountId: (paymentData as any).bankAccountId,
            type: 'CREDIT',
            amount: amountARS,
            description: bankDescription,
            reciboId: recibo.id,
            companyId: req.companyId,
          },
        });
        // Update bank account balance
        await (prisma as any).$executeRaw`
          UPDATE "bank_accounts" SET balance = balance + ${amountARS}, "updatedAt" = NOW()
          WHERE id = ${(paymentData as any).bankAccountId}
        `;
      }

      // Record payment in current account only for cuenta corriente
      if ((invoice as any).saleCondition === 'CUENTA_CORRIENTE') {
        const currentAccount = await currentAccountRepository.findByCustomerId(
          invoice.customerId,
          invoice.currency,
          ((invoice as any).fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL'
        );
        if (currentAccount) {
          const movement = await currentAccountRepository.addMovement({
            currentAccountId: currentAccount.id,
            type: 'CREDIT',
            amount: paymentData.amount,
            description: `Pago ${cashRegisterName || paymentData.paymentMethod} - ${invoice.type} ${invoice.number} (${recibo.number})`,
            invoiceId: invoice.id,
            cashRegisterId: usesCaja ? (paymentData.cashRegisterId ?? undefined) : undefined,
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

      // Auto-generate journal entry for payment
      await recordPaymentReceived({
        id: recibo.id,
        number: recibo.number,
        amount: paymentData.amount,
        paymentMethod: paymentData.paymentMethod,
        companyId: req.companyId,
        userId: req.user!.userId,
        invoiceNumber: invoice.number,
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

      const emittableStatuses = ['DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID'];
      if (!emittableStatuses.includes(invoice.status)) {
        throw new AppError('Solo se pueden emitir ante ARCA facturas en estado Borrador, Emitida, Pagada o Parcialmente Pagada', 400);
      }

      if (invoice.cae || invoice.status === 'AUTHORIZED') {
        throw new AppError('Esta factura ya está autorizada por ARCA', 400);
      }

      const config = await afipRepo.getActive();
      if (!config) {
        throw new AppError('No hay configuración AFIP activa. Configure ARCA en Configuración.', 400);
      }

      // Resolve the terminal (PdV) assigned to the user
      const pdv = await pdvService.getPdvForUser(req.user!.userId);

      // Get TA outside getNextNumber to reuse the same token for both sync and emit
      const ta = await afipService.getTokenAuth(config);

      // Atomically get next sequential number (syncs from AFIP on first use)
      const cbteNro = await pdvService.getNextNumber(pdv.id, pdv.number, invoice.type, config, ta);

      let result;
      try {
        result = await afipService.emitInvoice(invoice as any, config, pdv.number, cbteNro);
      } catch (afipError) {
        await saveAfipError(invoice.id, req.user!.userId, afipError).catch(() => {});
        throw afipError;
      }

      // Promote DRAFT/ISSUED → AUTHORIZED (CAE granted by ARCA).
      // Preserve PAID/PARTIALLY_PAID — payment workflow already moved past authorization step;
      // the CAE is still saved alongside, so the "autorizada" facet is captured by the cae field.
      const newStatus =
        invoice.status === 'DRAFT' || invoice.status === 'ISSUED'
          ? 'AUTHORIZED'
          : invoice.status;

      const updated = await invoiceRepo.update(req.params.id, {
        cae: result.cae,
        caeExpiry: result.caeExpiry,
        afipCbtNum: result.afipCbtNum,
        afipPtVenta: result.afipPtVenta,
        afipObservaciones: result.observaciones,
        status: newStatus,
      } as any);

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'AfipEmission',
        entityId: invoice.id,
        description: `CAE emitido para ${invoice.number}: ${result.cae}${result.observaciones ? ` | Obs: ${result.observaciones}` : ''}`,
        metadata: { cae: result.cae, caeExpiry: result.caeExpiry, afipCbtNum: result.afipCbtNum, observaciones: result.observaciones },
      });

      res.json({
        status: 'success',
        data: updated,
        ...(result.observaciones ? { warnings: result.observaciones } : {}),
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

      // Reverse current account movement only for cuenta corriente
      if ((existingInvoice as any).saleCondition === 'CUENTA_CORRIENTE') {
        const currentAccount = await currentAccountRepository.findByCustomerId(
          existingInvoice.customerId,
          existingInvoice.currency,
          ((existingInvoice as any).fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL'
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

  sendEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { to, pdfBase64 } = req.body;
      if (!to || typeof to !== 'string') throw new AppError('Destinatario requerido', 400);
      await sendInvoiceEmail(id, to, req.companyId!, pdfBase64);
      res.json({ status: 'success', message: 'Correo enviado correctamente' });
    } catch (error) {
      next(error);
    }
  };

  async getAfipErrors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = await prisma.$queryRaw<
        { id: string; errorMessage: string; errorType: string | null; rawResponse: string | null; createdAt: Date }[]
      >`
        SELECT id, "errorMessage", "errorType", "rawResponse", "createdAt"
        FROM "invoice_afip_errors"
        WHERE "invoiceId" = ${req.params.id}
        ORDER BY "createdAt" DESC
      `;
      res.json({ status: 'success', data: errors });
    } catch (error) {
      next(error);
    }
  }
}
