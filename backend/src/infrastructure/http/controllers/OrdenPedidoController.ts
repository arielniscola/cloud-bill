import { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
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
import { effectiveSaleCondition } from '../../../shared/utils/paymentTerms';
import { sendOrdenPedidoEmail } from '../../services/EmailService';
import {
  createOrdenPedidoSchema,
  updateOrdenPedidoSchema,
  updateOrdenPedidoStatusSchema,
  ordenPedidoQuerySchema,
} from '../../../application/dtos/ordenPedido.dto';
import { createReciboSchema } from '../../../application/dtos/recibo.dto';
import { resolveSaleWarehouse, setSaleWarehouse, getSaleWarehouseId } from '../../../shared/utils/saleWarehouse';
import prisma from '../../database/prisma';

/**
 * Busca una orden ya creada a partir del UUID que generó el cliente.
 *
 * Scopeada por empresa: un clientUuid de otra empresa no puede resolverse acá
 * (el unique de la columna es global, el aislamiento multi-tenant no).
 */
async function findByClientUuid(clientUuid: string, companyId?: string) {
  const repo = container.resolve<IOrdenPedidoRepository>('OrdenPedidoRepository');
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "orden_pedidos"
    WHERE "clientUuid" = ${clientUuid}
      AND ("companyId" = ${companyId ?? null} OR ${companyId ?? null}::text IS NULL)
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return repo.findById(rows[0].id);
}

/**
 * Revierte los efectos que generó el create() de la orden: movimientos de
 * stock (SALE → RETURN, o liberación de reserva) y el débito en cuenta
 * corriente. Lo usan tanto la cancelación como la eliminación de un borrador —
 * ambos caminos deben devolver el stock y la cuenta corriente a su estado previo.
 */
async function revertOrdenPedidoEffects(
  op: any,
  ctx: { userId: string; companyId?: string; fiscalMode?: 'FORMAL' | 'INFORMAL' },
  tx?: Prisma.TransactionClient
): Promise<void> {
  const stockRepo = container.resolve<IStockRepository>('StockRepository');
  const stockBehavior: string = op.stockBehavior ?? 'DISCOUNT';
  const itemsWithProduct = op.items.filter((item: any) => item.productId);

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
          userId: ctx.userId,
        }, tx);
      }
    } else {
      // RESERVE: liberar la reserva en el depósito de la orden
      // (o el por defecto si la orden no fijó uno).
      const defaultWarehouse = await resolveSaleWarehouse('orden_pedidos', op.id, ctx.companyId);
      if (defaultWarehouse) {
        for (const item of itemsWithProduct) {
          await stockRepo.decrementReserved(
            item.productId!,
            defaultWarehouse.id,
            Number(item.quantity),
            (item as any).variantId ?? null,
            tx,
          );
        }
      }
    }
  }

  // Si había débito en cuenta corriente al crear la OP, lo revertimos con un CRÉDITO.
  if (effectiveSaleCondition(op.saleCondition, op.paymentTerms) === 'CUENTA_CORRIENTE' && op.customerId) {
    const currentAccountRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
    const ca = await currentAccountRepo.findByCustomerId(op.customerId, op.currency as any, ctx.fiscalMode);
    if (ca) {
      await currentAccountRepo.addMovement({
        currentAccountId: ca.id,
        type: 'CREDIT',
        amount: Number(op.total),
        description: `Reversa por cancelación orden ${op.number}`,
        ordenPedidoId: op.id,
      } as any, tx);
    }
  }
}

export class OrdenPedidoController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPedidoRepository>('OrdenPedidoRepository');
      const query = ordenPedidoQuerySchema.parse(req.query);

      const result = await repo.findAll(
        { page: query.page, limit: query.limit },
        {
          customerId: query.customerId,
          budgetId: query.budgetId,
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
      const op = await repo.findById(req.params.id, req.companyId);
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

      // ── Idempotencia (ventas cargadas sin conexión) ──────────────────
      // El navegador genera el UUID ANTES de intentar subir. Si el reintento
      // llega sobre un envío que en realidad sí se había procesado, acá se
      // devuelve la orden existente en vez de crear una segunda.
      const clientUuid =
        data.clientUuid ?? (req.headers['idempotency-key'] as string | undefined) ?? null;

      if (clientUuid) {
        const existing = await findByClientUuid(clientUuid, req.companyId);
        if (existing) {
          res.status(200).json({ status: 'success', data: existing, idempotent: true });
          return;
        }
      }

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
        saleCondition: effectiveSaleCondition(data.saleCondition, data.paymentTerms),
        stockBehavior: data.stockBehavior ?? 'DISCOUNT',
        cashRegisterId: data.cashRegisterId ?? null,
        invoiceCashRegisterId: data.invoiceCashRegisterId ?? null,
        companyId: req.companyId,
        fiscalMode: req.fiscalMode,
        clientUuid,
        subtotal,
        taxAmount,
        total: subtotal + taxAmount,
        items,
      } as any);

      // Persistir el depósito elegido: las reversas (cancelar/eliminar) y los
      // remitos deben operar sobre el mismo depósito que el alta.
      await setSaleWarehouse('orden_pedidos', op.id, (data as any).warehouseId ?? null);

      // Trazabilidad presupuesto → OP (columna nueva; puede faltar la migración).
      if (data.budgetId) {
        try {
          await prisma.$executeRaw`UPDATE "orden_pedidos" SET "budgetId" = ${data.budgetId} WHERE id = ${op.id}`;
        } catch { /* migración 20260714120000 pendiente: el vínculo se pierde, nada más */ }
      }

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
          stockWarehouse = await warehouseRepo.findDefaultOrFirstActive(req.companyId);
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

      // Create DEBIT account movement if cuenta corriente (incl. pago a X días)
      if (effectiveSaleCondition(data.saleCondition, data.paymentTerms) === 'CUENTA_CORRIENTE' && op.customerId) {
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

      // Auto-generate a delivered remito for immediate-discount orders.
      // Stock was already moved above (SALE); the repository auto-marks DISCOUNT
      // remitos as DELIVERED. RESERVE orders get their (pending) remito on confirm.
      if (stockBehavior === 'DISCOUNT' && op.customerId && itemsWithProduct.length > 0) {
        const remitoRepo = container.resolve<IRemitoRepository>('RemitoRepository');
        await remitoRepo.create({
          customerId: op.customerId,
          userId: req.user!.userId,
          stockBehavior: 'DISCOUNT',
          notes: `Auto-generado desde orden de pedido ${op.number}`,
          ordenPedidoId: op.id,
          companyId: req.companyId,
          fiscalMode: req.fiscalMode,
          items: itemsWithProduct.map((item) => ({
            productId: item.productId!,
            quantity: Number(item.quantity),
            variantId: (item as any).variantId ?? null,
          })),
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
      // Dos reintentos del mismo clientUuid en paralelo: los dos pasan el
      // chequeo previo y el unique parcial frena al segundo. Ese caso no es un
      // error para quien llama — la orden existe, se devuelve.
      if ((error as any)?.code === 'P2002') {
        const clientUuid =
          (req.body?.clientUuid as string | undefined) ??
          (req.headers['idempotency-key'] as string | undefined);
        if (clientUuid) {
          const existing = await findByClientUuid(clientUuid, req.companyId).catch(() => null);
          if (existing) {
            res.status(200).json({ status: 'success', data: existing, idempotent: true });
            return;
          }
        }
      }
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPedidoRepository>('OrdenPedidoRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const op = await repo.findById(req.params.id, req.companyId);
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

      const op = await repo.findById(req.params.id, req.companyId);
      if (!op) throw new NotFoundError('Orden de pedido');

      if (op.status === 'CONVERTED' || op.status === 'CANCELLED') {
        throw new AppError(
          `No se puede cambiar el estado de una orden ${op.status === 'CONVERTED' ? 'convertida' : 'cancelada'}`,
          400
        );
      }

      const { status } = updateOrdenPedidoStatusSchema.parse(req.body);

      // Reversa de stock al cancelar — el create() de la OP descuenta (DISCOUNT)
      // o reserva (RESERVE) stock; al cancelar hay que devolverlo. La reversa
      // y el cambio de estado se confirman o revierten juntos.
      let updated;
      if (status === 'CANCELLED') {
        await prisma.$transaction(async (tx) => {
          await revertOrdenPedidoEffects(op, {
            userId: req.user!.userId,
            companyId: req.companyId,
            fiscalMode: req.fiscalMode,
          }, tx);
          await tx.$executeRaw`UPDATE "orden_pedidos" SET status = 'CANCELLED', "updatedAt" = NOW() WHERE id = ${op.id}`;
        }, { timeout: 30000 });
        updated = await repo.findById(req.params.id, req.companyId);
      } else {
        updated = await repo.update(req.params.id, { status });
      }

      // Auto-create Remito when confirming the OP — but skip if one already
      // exists (DISCOUNT orders generate their delivered remito at creation).
      if (status === 'CONFIRMED' && op.customerId) {
        const remitoRepo = container.resolve<IRemitoRepository>('RemitoRepository');
        const itemsWithProduct = op.items.filter((item) => item.productId);
        const existingRemitos = await remitoRepo.findAll({ page: 1, limit: 1 }, { ordenPedidoId: op.id });
        if (itemsWithProduct.length > 0 && existingRemitos.total === 0) {
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

      const op = await opRepo.findById(req.params.id, req.companyId);
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

      // La factura hereda el depósito de la orden (relevante para NC futuras).
      await setSaleWarehouse('invoices', invoice.id, await getSaleWarehouseId('orden_pedidos', op.id));

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
      } else {
        // Sin cobros previos la factura nace EMITIDA, no en borrador: el alta de
        // la orden ya aplicó stock y cuenta corriente, y un borrador habilitaría
        // "Emitir", que volvería a dispararlos (applyIssuanceEffects duplicando
        // el DEBIT y reservando stock ya descontado).
        await invoiceRepo.update(invoice.id, { status: 'ISSUED' });
        invoice.status = 'ISSUED' as any;
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

      const op = await opRepo.findById(req.params.id, req.companyId);
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
      // Capturado fuera del callback: TypeScript no sostiene el narrowing del
      // guard de arriba a través del closure de la transacción.
      const customerId = op.customerId;

      // Todo el cobro se confirma o se revierte junto: el recibo, el
      // movimiento bancario, el saldo de la cuenta bancaria, la cuenta
      // corriente y el estado de la orden. Antes eran llamadas sueltas: un
      // fallo a mitad dejaba el recibo emitido sin impactar el banco, o el
      // saldo bancario movido sin recibo que lo respalde.
      const newPaid = alreadyPaid + paymentData.amount;
      const newStatus = newPaid >= total - 0.001 ? 'PAID' : 'PARTIALLY_PAID';

      let recibo!: Awaited<ReturnType<IReciboRepository['create']>>;
      await prisma.$transaction(async (tx) => {
        recibo = await reciboRepo.create({
          ordenPedidoId: op.id,
          customerId: customerId,
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
        } as any, tx);

        // For BANK_TRANSFER with a bankAccountId, create a bank movement
        if (isBankTransfer && (paymentData as any).bankAccountId) {
          await (tx as any).bankMovement.create({
            data: {
              bankAccountId: (paymentData as any).bankAccountId,
              type: 'CREDIT',
              amount: paymentData.amount,
              description: `Cobro Orden ${op.number} (${recibo.number})`,
              reciboId: recibo.id,
              companyId: req.companyId,
            },
          });
          await tx.$executeRaw`
            UPDATE "bank_accounts" SET balance = balance + ${paymentData.amount}, "updatedAt" = NOW()
            WHERE id = ${(paymentData as any).bankAccountId}
          `;
        }

        const exchangeRate = paymentData.exchangeRate ?? 1;
        const arsAmount = Number(paymentData.amount) * exchangeRate;
        const isCC = effectiveSaleCondition((op as any).saleCondition, (op as any).paymentTerms) === 'CUENTA_CORRIENTE';

        if (isCC) {
          let currentAccount = await currentAccountRepo.findByCustomerId(customerId, op.currency as any, req.fiscalMode);
          if (!currentAccount) {
            currentAccount = await currentAccountRepo.createForCustomer(customerId, op.currency as any, undefined, req.fiscalMode, tx);
          }
          const movement = await currentAccountRepo.addMovement({
            currentAccountId: currentAccount.id,
            type: 'CREDIT',
            amount: paymentData.amount,
            description: `Cobro ${cashRegisterName || paymentData.paymentMethod} - Orden ${op.number} (${recibo.number})`,
            cashRegisterId: usesCaja ? (paymentData.cashRegisterId ?? undefined) : undefined,
            ordenPedidoId: op.id,
          } as any, tx);
          if (movement?.id) {
            await tx.accountMovement.update({ where: { id: movement.id }, data: { reciboId: recibo.id } });
          }
        }

        if (usesCaja && paymentData.cashRegisterId && !isCC) {
          let arsAccount = await currentAccountRepo.findByCustomerId(customerId, 'ARS', req.fiscalMode);
          if (!arsAccount) {
            arsAccount = await currentAccountRepo.createForCustomer(customerId, 'ARS', undefined, req.fiscalMode, tx);
          }
          await tx.accountMovement.create({
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

        await tx.$executeRaw`
          UPDATE "orden_pedidos" SET status = ${newStatus}::"OrdenPedidoStatus", "updatedAt" = NOW()
          WHERE id = ${req.params.id}
        `;
      });

      const updated = await opRepo.findById(req.params.id, req.companyId);

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
      const op = await repo.findById(req.params.id, req.companyId);
      if (!op) throw new NotFoundError('Orden de pedido');

      if (op.status !== 'DRAFT') {
        throw new AppError('Solo se pueden eliminar órdenes de pedido en borrador', 400);
      }

      const emittedRecibos = await prisma.recibo.count({
        where: { ordenPedidoId: op.id, status: 'EMITTED' },
      });
      if (emittedRecibos > 0) {
        throw new AppError(
          'La orden tiene cobros registrados. Cancelá primero sus recibos para revertir los cobros.',
          400
        );
      }

      // El create() del borrador ya movió stock (SALE o reserva) y pudo
      // debitar la cuenta corriente: hay que revertirlo antes de borrar,
      // si no el stock queda descontado para siempre. Reversa + limpieza +
      // borrado se confirman o revierten juntos.
      await prisma.$transaction(async (tx) => {
        await revertOrdenPedidoEffects(op, {
          userId: req.user!.userId,
          companyId: req.companyId,
          fiscalMode: req.fiscalMode,
        }, tx);

        // El borrador pudo generar un remito automático; se elimina junto con la
        // orden. Los movimientos de cuenta corriente y recibos cancelados se
        // desvinculan (conservan su historia, sin FK al documento borrado).
        await tx.$executeRaw`DELETE FROM "remito_items" WHERE "remitoId" IN (SELECT id FROM "remitos" WHERE "ordenPedidoId" = ${op.id})`;
        await tx.$executeRaw`DELETE FROM "remitos" WHERE "ordenPedidoId" = ${op.id}`;
        await tx.$executeRaw`UPDATE "account_movements" SET "ordenPedidoId" = NULL WHERE "ordenPedidoId" = ${op.id}`;
        await tx.$executeRaw`UPDATE "recibos" SET "ordenPedidoId" = NULL WHERE "ordenPedidoId" = ${op.id}`;
        await tx.$executeRaw`DELETE FROM "orden_pedido_items" WHERE "ordenPedidoId" = ${op.id}`;
        await tx.$executeRaw`DELETE FROM "orden_pedidos" WHERE id = ${op.id}`;
      }, { timeout: 30000 });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'DELETE',
        entity: 'OrdenPedido',
        entityId: op.id,
        description: `Orden de pedido ${op.number} (borrador) eliminada`,
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
