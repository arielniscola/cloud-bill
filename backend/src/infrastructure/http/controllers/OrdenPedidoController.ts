import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IOrdenPedidoRepository } from '../../../domain/repositories/IOrdenPedidoRepository';
import { IInvoiceRepository } from '../../../domain/repositories/IInvoiceRepository';
import { IStockRepository, IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { ICashRegisterRepository } from '../../../domain/repositories/ICashRegisterRepository';
import { IReciboRepository } from '../../../domain/repositories/IReciboRepository';
import { IRemitoRepository } from '../../../domain/repositories/IRemitoRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { ICustomerRepository } from '../../../domain/repositories/ICustomerRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { sendOrdenPedidoEmail } from '../../services/EmailService';
import {
  createOrdenPedidoSchema,
  updateOrdenPedidoSchema,
  updateOrdenPedidoStatusSchema,
  ordenPedidoQuerySchema,
} from '../../../application/dtos/ordenPedido.dto';
import { createReciboSchema } from '../../../application/dtos/recibo.dto';
import prisma from '../../database/prisma';

export class OrdenPedidoController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPedidoRepository>('OrdenPedidoRepository');
      const query = ordenPedidoQuerySchema.parse(req.query);

      const result = await repo.findAll(
        { page: query.page, limit: query.limit },
        {
          customerId: query.customerId,
          status: query.status,
          currency: query.currency,
          companyId: req.companyId,
          fiscalMode: req.fiscalMode,
          dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
          dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
          search: query.search,
        }
      );

      res.json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPedidoRepository>('OrdenPedidoRepository');
      const op = await repo.findById(req.params.id);
      if (!op) throw new NotFoundError('Orden de pedido');
      res.json({ status: 'success', data: op });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPedidoRepository>('OrdenPedidoRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const data = createOrdenPedidoSchema.parse(req.body);

      if (data.customerId) {
        const customerRepo = container.resolve<ICustomerRepository>('CustomerRepository');
        const customer = await customerRepo.findById(data.customerId);
        if (!customer) throw new NotFoundError('Cliente');
        if (!customer.isActive) throw new AppError('El cliente está inactivo', 400);
      }

      // Calculate totals from items
      let subtotal = 0;
      let taxAmount = 0;
      const items = data.items.map((item) => {
        const base = item.quantity * item.unitPrice;
        const discountAmt = base * ((item.discountPct ?? 0) / 100);
        const itemSubtotal = base - discountAmt;
        const itemTax = itemSubtotal * (item.taxRate / 100);
        subtotal += itemSubtotal;
        taxAmount += itemTax;
        return { ...item, subtotal: itemSubtotal, taxAmount: itemTax, total: itemSubtotal + itemTax };
      });

      const op = await repo.create({
        customerId: data.customerId ?? null,
        userId: req.user!.userId,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        currency: data.currency,
        exchangeRate: data.exchangeRate,
        notes: data.notes ?? null,
        paymentTerms: data.paymentTerms ?? null,
        saleCondition: data.saleCondition ?? 'CONTADO',
        stockBehavior: data.stockBehavior ?? 'DISCOUNT',
        cashRegisterId: data.cashRegisterId ?? null,
        invoiceCashRegisterId: data.invoiceCashRegisterId ?? null,
        companyId: req.companyId,
        fiscalMode: req.fiscalMode,
        subtotal,
        taxAmount,
        total: subtotal + taxAmount,
        items,
      } as any);

      // Handle stock for items with productId
      const stockBehavior: string = data.stockBehavior ?? 'DISCOUNT';
      const stockRepo = container.resolve<IStockRepository>('StockRepository');
      const warehouseRepo = container.resolve<IWarehouseRepository>('WarehouseRepository');
      const itemsWithProduct = op.items.filter((item) => item.productId);
      if (itemsWithProduct.length > 0) {
        let stockWarehouse = null;
        if ((data as any).warehouseId) {
          stockWarehouse = await warehouseRepo.findById((data as any).warehouseId);
          if (!stockWarehouse) throw new AppError('Almacén seleccionado no encontrado', 400);
        } else {
          stockWarehouse = await warehouseRepo.findDefault(req.companyId);
        }
        if (!stockWarehouse) {
          throw new AppError('No se encontró un almacén por defecto. Seleccioná un almacén para registrar el movimiento de stock.', 400);
        }
        const defaultWarehouse = stockWarehouse;
        for (const item of itemsWithProduct) {
          const variantId = (item as any).variantId ?? null;
          if (stockBehavior === 'RESERVE') {
            await stockRepo.incrementReserved(
              item.productId!,
              defaultWarehouse.id,
              Number(item.quantity),
              variantId,
            );
          } else {
            await stockRepo.addMovement({
              productId: item.productId!,
              variantId,
              warehouseId: defaultWarehouse.id,
              type: 'SALE',
              quantity: Number(item.quantity),
              reason: `Orden de pedido ${op.number}`,
              referenceId: op.id,
              userId: req.user!.userId,
            });
          }
        }
      }

      // Create DEBIT account movement if cuenta corriente
      if (data.saleCondition === 'CUENTA_CORRIENTE' && op.customerId) {
        const currentAccountRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
        let currentAccount = await currentAccountRepo.findByCustomerId(op.customerId, op.currency as any, req.fiscalMode);
        if (!currentAccount) {
          currentAccount = await currentAccountRepo.createForCustomer(op.customerId, op.currency as any, undefined, req.fiscalMode);
        }
        await currentAccountRepo.addMovement({
          currentAccountId: currentAccount.id,
          type: 'DEBIT',
          amount: Number(op.total),
          description: `Orden de pedido ${op.number} (cuenta corriente)`,
          ordenPedidoId: op.id,
        } as any);
      }

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'OrdenPedido',
        entityId: op.id,
        description: `Orden de pedido ${op.number} creada`,
      });

      res.status(201).json({ status: 'success', data: op });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPedidoRepository>('OrdenPedidoRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const op = await repo.findById(req.params.id);
      if (!op) throw new NotFoundError('Orden de pedido');

      if (op.status !== 'DRAFT') {
        throw new AppError('Solo se pueden editar órdenes de pedido en borrador', 400);
      }

      const data = updateOrdenPedidoSchema.parse(req.body);
      let updateData: any = { ...data };

      if (data.items) {
        let subtotal = 0;
        let taxAmount = 0;
        const items = data.items.map((item) => {
          const itemSubtotal = item.quantity! * item.unitPrice!;
          const itemTax = itemSubtotal * ((item.taxRate ?? 0) / 100);
          subtotal += itemSubtotal;
          taxAmount += itemTax;
          return { ...item, subtotal: itemSubtotal, taxAmount: itemTax, total: itemSubtotal + itemTax };
        });
        updateData = { ...updateData, items, subtotal, taxAmount, total: subtotal + taxAmount };
      }

      if (data.dueDate !== undefined) {
        updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
      }

      const updated = await repo.update(req.params.id, updateData);

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'OrdenPedido',
        entityId: op.id,
        description: `Orden de pedido ${op.number} actualizada`,
      });

      res.json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPedidoRepository>('OrdenPedidoRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const op = await repo.findById(req.params.id);
      if (!op) throw new NotFoundError('Orden de pedido');

      if (op.status === 'CONVERTED' || op.status === 'CANCELLED') {
        throw new AppError(
          `No se puede cambiar el estado de una orden ${op.status === 'CONVERTED' ? 'convertida' : 'cancelada'}`,
          400
        );
      }

      const { status } = updateOrdenPedidoStatusSchema.parse(req.body);

      // Reversa de stock al cancelar — el create() de la OP descuenta (DISCOUNT)
      // o reserva (RESERVE) stock; al cancelar hay que devolverlo.
      if (status === 'CANCELLED') {
        const stockRepo = container.resolve<IStockRepository>('StockRepository');
        const warehouseRepo = container.resolve<IWarehouseRepository>('WarehouseRepository');
        const stockBehavior: string = (op as any).stockBehavior ?? 'DISCOUNT';
        const itemsWithProduct = op.items.filter((item) => item.productId);

        if (itemsWithProduct.length > 0) {
          if (stockBehavior === 'DISCOUNT') {
            // Buscamos los SALE movements originales por referenceId para saber
            // de qué almacén descontar la devolución (RETURN).
            const originalMovs = await prisma.stockMovement.findMany({
              where: { referenceId: op.id, type: 'SALE' },
            });
            for (const mov of originalMovs) {
              await stockRepo.addMovement({
                productId: mov.productId,
                variantId: (mov as any).variantId ?? null,
                warehouseId: mov.warehouseId,
                type: 'RETURN',
                quantity: Number(mov.quantity),
                reason: `Cancelación orden de pedido ${op.number}`,
                referenceId: op.id,
                userId: req.user!.userId,
              });
            }
          } else {
            // RESERVE: liberar la reserva en el almacén por defecto
            // (el create() usó findDefault cuando no había warehouseId explícito).
            const defaultWarehouse = await warehouseRepo.findDefault(req.companyId);
            if (defaultWarehouse) {
              for (const item of itemsWithProduct) {
                await stockRepo.decrementReserved(
                  item.productId!,
                  defaultWarehouse.id,
                  Number(item.quantity),
                  (item as any).variantId ?? null,
                );
              }
            }
          }
        }

        // Si había débito en cuenta corriente al crear la OP, lo revertimos con un CRÉDITO.
        if ((op as any).saleCondition === 'CUENTA_CORRIENTE' && op.customerId) {
          const currentAccountRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
          const ca = await currentAccountRepo.findByCustomerId(op.customerId, op.currency as any, req.fiscalMode);
          if (ca) {
            await currentAccountRepo.addMovement({
              currentAccountId: ca.id,
              type: 'CREDIT',
              amount: Number(op.total),
              description: `Reversa por cancelación orden ${op.number}`,
              ordenPedidoId: op.id,
            } as any);
          }
        }
      }

      const updated = await repo.update(req.params.id, { status });

      // Auto-create Remito when confirming the OP
      if (status === 'CONFIRMED' && op.customerId) {
        const remitoRepo = container.resolve<IRemitoRepository>('RemitoRepository');
        const itemsWithProduct = op.items.filter((item) => item.productId);
        if (itemsWithProduct.length > 0) {
          await remitoRepo.create({
            customerId: op.customerId,
            userId: req.user!.userId,
            stockBehavior: ((op as any).stockBehavior ?? 'DISCOUNT') as any,
            notes: `Auto-generado desde orden de pedido ${op.number}`,
            ordenPedidoId: op.id,
            companyId: req.companyId,
            items: itemsWithProduct.map((item) => ({
              productId: item.productId!,
              quantity: Number(item.quantity),
            })),
          } as any);
        }
      }

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'OrdenPedido',
        entityId: op.id,
        description: `Orden de pedido ${op.number} actualizada a estado ${status}`,
      });

      res.json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  async convertToInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const opRepo = container.resolve<IOrdenPedidoRepository>('OrdenPedidoRepository');
      const invoiceRepo = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const op = await opRepo.findById(req.params.id);
      if (!op) throw new NotFoundError('Orden de pedido');

      if (op.status === 'CONVERTED') throw new AppError('La orden ya fue convertida a factura', 400);
      if (op.status === 'CANCELLED') throw new AppError('No se puede convertir una orden cancelada', 400);
      if (!op.customerId) throw new AppError('La orden debe tener un cliente para convertirse en factura', 400);

      const itemsWithoutProduct = op.items.filter((i) => !i.productId);
      if (itemsWithoutProduct.length > 0) {
        throw new AppError('Todos los items deben tener un producto asignado para generar la factura', 400);
      }

      const invoiceType = req.body.invoiceType || 'FACTURA_B';
      const opSaleCondition = (op as any).saleCondition ?? 'CONTADO';

      // Invoice from OP: fiscal only — no stock movements, no payments, no CC account movement
      // (stock and CC account movement were already handled at OP creation)
      const invoice = await invoiceRepo.create({
        type: invoiceType,
        customerId: op.customerId,
        userId: req.user!.userId,
        companyId: req.companyId,
        fiscalMode: ((op as any).fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL',
        dueDate: undefined,
        notes: op.notes ?? undefined,
        currency: op.currency as any,
        exchangeRate: Number(op.exchangeRate),
        saleCondition: opSaleCondition,
        stockBehavior: 'RESERVE', // Prevent stock movements in InvoiceController
        ordenPedidoId: op.id,
        items: op.items.map((item) => ({
          productId: item.productId!,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discountPct: Number(item.discountPct ?? 0),
          taxRate: Number(item.taxRate),
        })),
      } as any);

      // Mark OP as CONVERTED and link to invoice
      await opRepo.update(req.params.id, { status: 'CONVERTED', invoiceId: invoice.id });

      // Inherit payment from OP: link existing recibos and set invoice status
      const opRecibos = await (prisma as any).recibo.findMany({
        where: { ordenPedidoId: op.id, status: 'EMITTED' },
      });

      if (opRecibos.length > 0) {
        const totalPaid = opRecibos.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
        const invoiceTotal = Number(invoice.total);
        const newStatus = totalPaid >= invoiceTotal - 0.001 ? 'PAID' : 'PARTIALLY_PAID';

        // Link each recibo to the invoice
        for (const recibo of opRecibos) {
          await (prisma as any).recibo.update({
            where: { id: recibo.id },
            data: { invoiceId: invoice.id },
          });
        }

        await invoiceRepo.update(invoice.id, { status: newStatus });
        invoice.status = newStatus as any;
      }

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'OrdenPedido',
        entityId: op.id,
        description: `Orden de pedido ${op.number} convertida a factura ${invoice.number}`,
      });

      res.status(201).json({ status: 'success', data: invoice });
    } catch (error) {
      next(error);
    }
  }

  async pay(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const opRepo = container.resolve<IOrdenPedidoRepository>('OrdenPedidoRepository');
      const currentAccountRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
      const cashRegisterRepo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      const reciboRepo = container.resolve<IReciboRepository>('ReciboRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const op = await opRepo.findById(req.params.id);
      if (!op) throw new NotFoundError('Orden de pedido');

      if (op.status === 'DRAFT') throw new AppError('Debe confirmar la orden antes de registrar un pago', 400);
      if (op.status === 'CANCELLED' || op.status === 'CONVERTED') {
        throw new AppError('No se puede registrar un pago en esta orden', 400);
      }
      if (op.status === 'PAID') throw new AppError('La orden ya está pagada', 400);

      const paymentData = createReciboSchema.parse(req.body);

      // CHECK, BANK_TRANSFER y MERCADO_PAGO no impactan en caja física —
      // tienen su propio canal (banco / cuenta MP).
      const isCheck = paymentData.paymentMethod === 'CHECK';
      const isBankTransfer = paymentData.paymentMethod === 'BANK_TRANSFER';
      const isMercadoPago = paymentData.paymentMethod === 'MERCADO_PAGO';
      const usesCaja = !isCheck && !isBankTransfer && !isMercadoPago;

      let cashRegisterName = '';
      if (usesCaja && paymentData.cashRegisterId) {
        const cashRegister = await cashRegisterRepo.findById(paymentData.cashRegisterId);
        if (!cashRegister) throw new AppError('Caja no encontrada', 400);
        if (!cashRegister.isActive) throw new AppError('La caja seleccionada está inactiva', 400);
        cashRegisterName = cashRegister.name;
      }

      // Calculate remaining balance
      const activeRecibos = await (prisma as any).recibo.findMany({
        where: { ordenPedidoId: op.id, status: 'EMITTED' },
      });
      const alreadyPaid = activeRecibos.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
      const total = Number(op.total);
      const remaining = total - alreadyPaid;

      if (paymentData.amount > remaining + 0.001) {
        throw new AppError(`El monto excede el saldo pendiente (${remaining.toFixed(2)})`, 400);
      }

      if (!op.customerId) throw new AppError('La orden debe tener un cliente para registrar un pago', 400);

      // Create recibo
      const recibo = await reciboRepo.create({
        ordenPedidoId: op.id,
        customerId: op.customerId,
        userId: req.user!.userId,
        cashRegisterId: usesCaja ? (paymentData.cashRegisterId ?? null) : null,
        bankAccountId: isBankTransfer ? ((paymentData as any).bankAccountId ?? null) : null,
        amount: paymentData.amount,
        currency: op.currency,
        exchangeRate: paymentData.exchangeRate ?? 1,
        paymentMethod: paymentData.paymentMethod,
        reference: paymentData.reference ?? null,
        bank: paymentData.bank ?? null,
        checkDueDate: paymentData.checkDueDate ? new Date(paymentData.checkDueDate) : null,
        installments: paymentData.installments ?? null,
        notes: paymentData.notes ?? null,
        companyId: req.companyId,
        fiscalMode: ((op as any).fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL',
      } as any);

      // For BANK_TRANSFER with a bankAccountId, create a bank movement
      if (isBankTransfer && (paymentData as any).bankAccountId) {
        await (prisma as any).bankMovement.create({
          data: {
            bankAccountId: (paymentData as any).bankAccountId,
            type: 'CREDIT',
            amount: paymentData.amount,
            description: `Cobro Orden ${op.number} (${recibo.number})`,
            reciboId: recibo.id,
            companyId: req.companyId,
          },
        });
        await (prisma as any).$executeRaw`
          UPDATE "bank_accounts" SET balance = balance + ${paymentData.amount}, "updatedAt" = NOW()
          WHERE id = ${(paymentData as any).bankAccountId}
        `;
      }

      const exchangeRate = paymentData.exchangeRate ?? 1;
      const arsAmount = Number(paymentData.amount) * exchangeRate;
      const isCC = (op as any).saleCondition === 'CUENTA_CORRIENTE';

      if (isCC) {
        let currentAccount = await currentAccountRepo.findByCustomerId(op.customerId, op.currency as any, req.fiscalMode);
        if (!currentAccount) {
          currentAccount = await currentAccountRepo.createForCustomer(op.customerId, op.currency as any, undefined, req.fiscalMode);
        }
        const movement = await currentAccountRepo.addMovement({
          currentAccountId: currentAccount.id,
          type: 'CREDIT',
          amount: paymentData.amount,
          description: `Cobro ${cashRegisterName || paymentData.paymentMethod} - Orden ${op.number} (${recibo.number})`,
          cashRegisterId: usesCaja ? (paymentData.cashRegisterId ?? undefined) : undefined,
          ordenPedidoId: op.id,
        } as any);
        if (movement?.id) {
          await prisma.accountMovement.update({ where: { id: movement.id }, data: { reciboId: recibo.id } });
        }
      }

      if (usesCaja && paymentData.cashRegisterId && !isCC) {
        let arsAccount = await currentAccountRepo.findByCustomerId(op.customerId, 'ARS', req.fiscalMode);
        if (!arsAccount) {
          arsAccount = await currentAccountRepo.createForCustomer(op.customerId, 'ARS', undefined, req.fiscalMode);
        }
        await prisma.accountMovement.create({
          data: {
            currentAccountId: arsAccount.id,
            type: 'CREDIT',
            amount: arsAmount,
            balance: arsAccount.balance,
            description: `Cobro ${cashRegisterName} - Orden ${op.number} (${recibo.number})`,
            cashRegisterId: paymentData.cashRegisterId,
            reciboId: recibo.id,
          },
        });
      }

      // Update OP status
      const newPaid = alreadyPaid + paymentData.amount;
      const newStatus = newPaid >= total - 0.001 ? 'PAID' : 'PARTIALLY_PAID';
      const updated = await opRepo.update(req.params.id, { status: newStatus as any });

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'PAYMENT',
        entity: 'OrdenPedido',
        entityId: op.id,
        description: `Pago ${recibo.number} registrado en orden ${op.number}`,
      });

      res.json({ status: 'success', data: updated, recibo });
    } catch (error) {
      next(error);
    }
  }

  sendEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { to, pdfBase64 } = req.body;
      if (!to || typeof to !== 'string') throw new AppError('Destinatario requerido', 400);
      await sendOrdenPedidoEmail(id, to, req.companyId!, pdfBase64);
      res.json({ status: 'success', message: 'Email enviado' });
    } catch (error) {
      next(error);
    }
  };

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPedidoRepository>('OrdenPedidoRepository');
      const op = await repo.findById(req.params.id);
      if (!op) throw new NotFoundError('Orden de pedido');

      if (op.status !== 'DRAFT') {
        throw new AppError('Solo se pueden eliminar órdenes de pedido en borrador', 400);
      }

      await repo.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
