import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IInvoiceRepository } from '../../../domain/repositories/IInvoiceRepository';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { IStockRepository } from '../../../domain/repositories/IWarehouseRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { Currency } from '../../../shared/types';
import { ICashRegisterRepository } from '../../../domain/repositories/ICashRegisterRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { IAfipConfigRepository } from '../../../domain/repositories/IAfipConfigRepository';
import { IReciboRepository } from '../../../domain/repositories/IReciboRepository';
import { IRemitoRepository } from '../../../domain/repositories/IRemitoRepository';
import { ICustomerRepository } from '../../../domain/repositories/ICustomerRepository';
import { effectiveSaleCondition } from '../../../shared/utils/paymentTerms';
import { afipService } from '../../services/AfipService';
import { pdvService } from '../../services/PdvService';
import { sendInvoiceEmail } from '../../services/EmailService';
import { saveAfipError } from '../../../shared/utils/saveAfipError';
import { computeDeliveryStatus, computeDeliveryStatusBatch } from '../../../shared/utils/deliveryStatus';
import { resolveSaleWarehouse, setSaleWarehouse } from '../../../shared/utils/saleWarehouse';
import { createReciboSchema } from '../../../application/dtos/recibo.dto';
import prisma from '../../database/prisma';
import { recordInvoiceCreated, recordPaymentReceived, recordRefundPaid } from '../../services/AccountingService';

type IssuanceCtx = { userId: string; companyId: string; fiscalMode?: 'FORMAL' | 'INFORMAL' };

/**
 * Efectos de la emisión de una factura: movimiento en cuenta corriente (venta
 * CC o "a X días"), movimiento de stock (descuento o reserva), remito
 * auto-entregado para ventas con descuento inmediato y asiento contable.
 * Se ejecuta UNA sola vez, al salir del estado borrador.
 * `invoice` debe venir de findById (incluye items + customer).
 */
async function applyIssuanceEffects(invoice: any, ctx: IssuanceCtx): Promise<void> {
  const currentAccountRepository = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
  const stockRepository = container.resolve<IStockRepository>('StockRepository');

  const type: string = invoice.type;
  const currency: Currency = (invoice.currency || 'ARS') as Currency;
  const stockBehavior: string = invoice.stockBehavior ?? 'DISCOUNT';
  const saleCondition: string = effectiveSaleCondition(invoice.saleCondition, invoice.paymentTerms);

  // Lecturas previas (no necesitan la transacción)
  const isFactura = type.startsWith('FACTURA');
  const usesCC = saleCondition === 'CUENTA_CORRIENTE' && invoice.customerId;
  // Depósito elegido en la factura, o el por defecto de la empresa.
  const defaultWarehouse = isFactura
    ? await resolveSaleWarehouse('invoices', invoice.id, ctx.companyId)
    : null;
  const existingAccount = usesCC
    ? await currentAccountRepository.findByCustomerId(invoice.customerId, currency, ctx.fiscalMode)
    : null;

  // Todos los efectos se confirman o revierten juntos: sin esto, un fallo a
  // mitad (p.ej. stock insuficiente en el 3er ítem) dejaba la cuenta corriente
  // debitada con el stock a medio descontar.
  await prisma.$transaction(async (tx) => {
    // Cuenta corriente (venta CC o pago a X días)
    if (usesCC) {
      const currentAccount = existingAccount
        ?? await currentAccountRepository.createForCustomer(invoice.customerId, currency, undefined, ctx.fiscalMode, tx);
      const isCredit = type.startsWith('NOTA_CREDITO');
      await currentAccountRepository.addMovement({
        currentAccountId: currentAccount.id,
        type: isCredit ? 'CREDIT' : 'DEBIT',
        amount: Number(invoice.total),
        description: `${type} ${invoice.number}`,
        invoiceId: invoice.id,
      }, tx);
    }

    // Stock (solo facturas)
    if (isFactura && defaultWarehouse) {
      if (stockBehavior === 'RESERVE') {
        for (const item of invoice.items) {
          await stockRepository.incrementReserved(
            item.productId,
            defaultWarehouse.id,
            Number(item.quantity),
            (item as any).variantId ?? null,
            tx,
          );
        }
      } else {
        for (const item of invoice.items) {
          await stockRepository.addMovement({
            productId: item.productId,
            variantId: (item as any).variantId ?? null,
            warehouseId: defaultWarehouse.id,
            type: 'SALE',
            quantity: Number(item.quantity),
            reason: `Invoice ${invoice.number}`,
            referenceId: invoice.id,
            userId: ctx.userId,
          }, tx);
        }
      }
    }

    // Remito auto-entregado para ventas con descuento inmediato. El stock ya se
    // movió arriba (SALE), así que el remito vinculado no mueve stock.
    if (isFactura && stockBehavior === 'DISCOUNT' && invoice.customerId) {
      const remitoRepository = container.resolve<IRemitoRepository>('RemitoRepository');
      await remitoRepository.create({
        customerId: invoice.customerId,
        userId: ctx.userId,
        stockBehavior: 'DISCOUNT',
        notes: `Auto-generado desde factura ${invoice.number}`,
        invoiceId: invoice.id,
        companyId: ctx.companyId,
        fiscalMode: ctx.fiscalMode,
        items: invoice.items.map((item: any) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          variantId: (item as any).variantId ?? null,
        })),
      } as any, tx);
    }
  }, { timeout: 30000 });

  // Asiento contable — fuera de la transacción: es best-effort por diseño
  // (recordInvoiceCreated captura sus propios errores y no debe abortar la emisión).
  await recordInvoiceCreated({
    id: invoice.id,
    number: invoice.number,
    type: invoice.type,
    subtotal: Number(invoice.subtotal),
    taxAmount: Number(invoice.taxAmount),
    total: Number(invoice.total),
    companyId: ctx.companyId,
    userId: ctx.userId,
  });
}

// Guía al usuario hacia el caso de uso correcto cuando intenta asignar a mano
// un estado que tiene efectos asociados (ver updateStatus).
const MANUAL_STATUS_HINTS: Record<string, string> = {
  AUTHORIZED: 'El estado Autorizada lo asigna la emisión ante ARCA ("Emitir ARCA").',
  PAID: 'Para marcarla pagada registrá el cobro (recibo).',
  PARTIALLY_PAID: 'Los cobros parciales se registran con recibos.',
  CANCELLED: 'Para anularla usá "Anular", que revierte los movimientos generados.',
  DRAFT: 'Una factura emitida no puede volver a borrador.',
};

/**
 * Aplica los efectos de emisión solo si la factura todavía está en borrador.
 * Garantiza que los movimientos se generen una única vez al salir de DRAFT,
 * sin importar el camino (emitir, emitir a ARCA o cobrar).
 */
async function leaveDraftIfNeeded(invoice: any, ctx: IssuanceCtx): Promise<void> {
  if (invoice && invoice.status === 'DRAFT') {
    await applyIssuanceEffects(invoice, ctx);
  }
}

export class InvoiceController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceRepository = container.resolve<IInvoiceRepository>('InvoiceRepository');

      const currency: Currency = req.body.currency || 'ARS';
      const exchangeRate: number = req.body.exchangeRate || 1;

      // Una venta "a X días" (pago diferido) se persiste como cuenta corriente:
      // los movimientos se generan al emitir, no al crear el borrador.
      const saleCondition: string = effectiveSaleCondition(req.body.saleCondition, req.body.paymentTerms);

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

      // Depósito elegido para el stock (raw SQL: el cliente Prisma puede no
      // conocer la columna todavía).
      await setSaleWarehouse('invoices', invoice.id, req.body.warehouseId ?? null);

      // NOTA: la factura nace en BORRADOR (DRAFT). Mientras esté en borrador NO
      // genera movimientos (cuenta corriente, stock, remito, asiento contable) —
      // así puede editarse y eliminarse libremente. Los efectos se aplican una
      // sola vez al emitirse (ver applyIssuanceEffects / leaveDraftIfNeeded).
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'Invoice',
        entityId: invoice.id,
        description: `Factura ${invoice.number} creada (borrador)`,
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
      const invoice = await invoiceRepository.findById(req.params.id, req.companyId);

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

      const existingInvoice = await invoiceRepository.findById(req.params.id, req.companyId);
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
        saleCondition: effectiveSaleCondition(req.body.saleCondition, req.body.paymentTerms),
        originInvoiceId: req.body.originInvoiceId ?? null,
        currency,
        exchangeRate,
        items: req.body.items,
      });

      await setSaleWarehouse('invoices', req.params.id, req.body.warehouseId ?? null);

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

      const existingInvoice = await invoiceRepository.findById(req.params.id, req.companyId);
      if (!existingInvoice) {
        throw new NotFoundError('Invoice');
      }

      if (existingInvoice.status === 'CANCELLED') {
        throw new AppError('Cannot modify cancelled invoice', 400);
      }

      // Única transición manual permitida: emitir un borrador (DRAFT → ISSUED).
      // Los demás estados tienen su propio caso de uso con efectos asociados;
      // asignarlos a mano dejaría la factura inconsistente (PAID sin recibos,
      // CANCELLED sin reversas, o un retorno a DRAFT que re-dispararía los
      // efectos de emisión duplicando stock y cuenta corriente).
      const from = existingInvoice.status;
      const to: string = req.body.status;
      if (!(from === 'DRAFT' && to === 'ISSUED')) {
        throw new AppError(
          `Transición de estado inválida (${from} → ${to}). ${MANUAL_STATUS_HINTS[to] ?? ''}`.trim(),
          400
        );
      }

      const invoice = await invoiceRepository.update(req.params.id, {
        status: req.body.status,
      });

      // Al salir del borrador ("Emitir" → ISSUED) se generan los movimientos
      // asociados, una sola vez.
      await leaveDraftIfNeeded(existingInvoice, {
        userId: req.user!.userId,
        companyId: req.companyId!,
        fiscalMode: req.fiscalMode,
      });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'Invoice',
        entityId: existingInvoice.id,
        description: `Factura ${existingInvoice.number} emitida`,
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

      const invoice = await invoiceRepository.findById(req.params.id, req.companyId);
      if (!invoice) throw new NotFoundError('Invoice');

      // Una Nota de Crédito no se "cobra": su pago es una DEVOLUCIÓN al cliente
      // (sale plata de caja/banco, DEBIT en cuenta corriente y reingreso de stock).
      const isCreditNote = invoice.type.startsWith('NOTA_CREDITO');

      if (invoice.status === 'PAID') {
        throw new AppError(isCreditNote ? 'La nota de crédito ya fue devuelta' : 'La factura ya está pagada', 400);
      }
      if (invoice.status === 'CANCELLED') {
        throw new AppError(isCreditNote ? 'No se puede devolver una nota de crédito cancelada' : 'No se puede pagar una factura cancelada', 400);
      }

      // Cobrar un borrador lo emite: primero se generan los movimientos de la
      // emisión (cuenta corriente, stock, remito, asiento) y luego el cobro.
      await leaveDraftIfNeeded(invoice, {
        userId: req.user!.userId,
        companyId: req.companyId!,
        fiscalMode: req.fiscalMode,
      });

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

      // CHECK, BANK_TRANSFER y MERCADO_PAGO no impactan en caja física —
      // tienen su propio canal (banco / cuenta MP).
      const isCheck = paymentData.paymentMethod === 'CHECK';
      const isBankTransfer = paymentData.paymentMethod === 'BANK_TRANSFER';
      const isMercadoPago = paymentData.paymentMethod === 'MERCADO_PAGO';
      const usesCaja = !isCheck && !isBankTransfer && !isMercadoPago;

      // Estado resultante del cobro (calculable de antemano)
      const newPaid = alreadyPaid + paymentData.amount;
      const newStatus: 'PAID' | 'PARTIALLY_PAID' = newPaid >= total - 0.001 ? 'PAID' : 'PARTIALLY_PAID';

      // Lecturas previas (no necesitan la transacción)
      const usesCC = effectiveSaleCondition((invoice as any).saleCondition, (invoice as any).paymentTerms) === 'CUENTA_CORRIENTE';
      const currentAccount = usesCC
        ? await currentAccountRepository.findByCustomerId(
            invoice.customerId,
            invoice.currency,
            ((invoice as any).fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL'
          )
        : null;
      // La mercadería devuelta reingresa al depósito de la factura de origen
      // (o al por defecto si la NC no tiene depósito propio).
      const returnWarehouse = isCreditNote && newStatus === 'PAID'
        ? await resolveSaleWarehouse('invoices', (invoice as any).originInvoiceId ?? invoice.id, req.companyId)
        : null;

      // Recibo + banco + cuenta corriente + estado + reingreso de stock (NC):
      // se confirman o revierten juntos — un cobro a medias es una caja que no cierra.
      let recibo: any;
      await prisma.$transaction(async (tx) => {
        recibo = await reciboRepository.create({
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
        } as any, tx);

        // For BANK_TRANSFER with a bankAccountId, create a bank movement.
        // NC → es una devolución: DEBIT (sale plata) y baja el saldo del banco.
        if (isBankTransfer && (paymentData as any).bankAccountId) {
          const exchangeRate = Number((invoice as any).exchangeRate ?? 1);
          const amountARS = invoice.currency !== 'ARS' ? paymentData.amount * exchangeRate : paymentData.amount;
          const customerName = (invoice as any).customer?.name ?? '';
          const bankDescription = `${isCreditNote ? 'Devolución' : 'Cobro'} ${invoice.type} ${invoice.number}${customerName ? ` - ${customerName}` : ''} (${recibo.number})`;
          await (tx as any).bankMovement.create({
            data: {
              bankAccountId: (paymentData as any).bankAccountId,
              type: isCreditNote ? 'DEBIT' : 'CREDIT',
              amount: amountARS,
              description: bankDescription,
              reciboId: recibo.id,
              companyId: req.companyId,
            },
          });
          // Update bank account balance (+ cobro / − devolución)
          const signedAmount = isCreditNote ? -amountARS : amountARS;
          await tx.$executeRaw`
            UPDATE "bank_accounts" SET balance = balance + ${signedAmount}, "updatedAt" = NOW()
            WHERE id = ${(paymentData as any).bankAccountId}
          `;
        }

        // Record payment in current account only for cuenta corriente (incl. pago a X días)
        if (currentAccount) {
          const movement = await currentAccountRepository.addMovement({
            currentAccountId: currentAccount.id,
            type: isCreditNote ? 'DEBIT' : 'CREDIT',
            amount: paymentData.amount,
            description: `${isCreditNote ? 'Devolución' : 'Pago'} ${cashRegisterName || paymentData.paymentMethod} - ${invoice.type} ${invoice.number} (${recibo.number})`,
            invoiceId: invoice.id,
            cashRegisterId: usesCaja ? (paymentData.cashRegisterId ?? undefined) : undefined,
          }, tx);
          // Link movement to recibo
          if (movement?.id) {
            await tx.accountMovement.update({
              where: { id: movement.id },
              data: { reciboId: recibo.id },
            });
          }
        }

        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: newStatus },
        });

        // Reingreso de mercadería devuelta: cuando la NC queda totalmente devuelta,
        // los ítems con producto vuelven al stock (movimiento RETURN). Se hace una
        // sola vez (al llegar a PAID) para no duplicar ante devoluciones parciales.
        if (returnWarehouse) {
          const stockRepository = container.resolve<IStockRepository>('StockRepository');
          for (const item of invoice.items) {
            if (!item.productId) continue;
            await stockRepository.addMovement({
              productId: item.productId,
              variantId: (item as any).variantId ?? null,
              warehouseId: returnWarehouse.id,
              type: 'RETURN',
              quantity: item.quantity.toNumber(),
              reason: `Devolución NC ${invoice.number}`,
              referenceId: invoice.id,
              userId: req.user!.userId,
            }, tx);
          }
        }
      }, { timeout: 30000 });

      const updated = await invoiceRepository.findById(req.params.id, req.companyId);

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'PAYMENT',
        entity: 'Invoice',
        entityId: invoice.id,
        description: isCreditNote
          ? `Devolución ${recibo.number} registrada en NC ${invoice.number}`
          : `Pago ${recibo.number} registrado en factura ${invoice.number}`,
      });

      // Auto-generate journal entry (cobro de factura / devolución de NC)
      const recordEntry = isCreditNote ? recordRefundPaid : recordPaymentReceived;
      await recordEntry({
        id: recibo.id,
        number: recibo.number,
        amount: paymentData.amount,
        paymentMethod: paymentData.paymentMethod,
        companyId: req.companyId!,
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

      const invoice = await invoiceRepo.findById(req.params.id, req.companyId);
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

      // Notas de Crédito/Débito necesitan el comprobante de origen (CbtesAsoc) para ARCA.
      const isNotaCD = invoice.type.startsWith('NOTA_CREDITO') || invoice.type.startsWith('NOTA_DEBITO');
      let originInvoice: Awaited<ReturnType<IInvoiceRepository['findById']>> = null;
      if (isNotaCD) {
        if (!invoice.originInvoiceId) {
          throw new AppError('La nota de crédito/débito no tiene un comprobante de origen asociado.', 400);
        }
        originInvoice = await invoiceRepo.findById(invoice.originInvoiceId);
        if (!originInvoice) throw new AppError('No se encontró el comprobante de origen asociado.', 400);
        if (!originInvoice.cae || !originInvoice.afipPtVenta || !originInvoice.afipCbtNum) {
          throw new AppError('El comprobante de origen debe estar autorizado por ARCA (con CAE) antes de emitir la nota.', 400);
        }
      }

      // Get TA outside getNextNumber to reuse the same token for both sync and emit
      const ta = await afipService.getTokenAuth(config);

      // Serializamos numeración + emisión por (pdv, tipo) con advisory lock —
      // ARCA exige orden estricto; sin esto, dos emisiones concurrentes pueden
      // llegar a ARCA invertidas y rechazarse con [10016].
      const result = await pdvService.runWithPdvLock(pdv.id, invoice.type, async () => {
        const cbteNro = await pdvService.getNextNumber(pdv.id, pdv.number, invoice.type, config, ta);
        try {
          return await afipService.emitInvoice(invoice as any, config, pdv.number, cbteNro, originInvoice);
        } catch (afipError) {
          await saveAfipError(invoice.id, req.user!.userId, afipError).catch(() => {});
          throw afipError;
        }
      });

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

      // Emitir a ARCA desde borrador también genera los movimientos asociados.
      await leaveDraftIfNeeded(invoice, {
        userId: req.user!.userId,
        companyId: req.companyId!,
        fiscalMode: req.fiscalMode,
      });

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

      const existingInvoice = await invoiceRepository.findById(req.params.id, req.companyId);
      if (!existingInvoice) {
        throw new NotFoundError('Invoice');
      }

      if (existingInvoice.status === 'CANCELLED') {
        throw new AppError('Invoice is already cancelled', 400);
      }

      // Una factura autorizada por ARCA no se anula internamente: el
      // comprobante fiscal ya existe. El camino correcto es la Nota de Crédito.
      if (existingInvoice.status === 'AUTHORIZED' || (existingInvoice as any).cae) {
        throw new AppError(
          'La factura está autorizada por ARCA y no puede anularse. Generá una Nota de Crédito sobre este comprobante.',
          400
        );
      }

      // Los cobros se revierten cancelando sus recibos (eso devuelve caja,
      // banco y cuenta corriente). Anular con recibos vigentes dejaría plata
      // registrada contra una factura inexistente.
      const emittedRecibos = await prisma.recibo.count({
        where: { invoiceId: existingInvoice.id, status: 'EMITTED' },
      });
      if (emittedRecibos > 0) {
        throw new AppError(
          'La factura tiene cobros registrados. Cancelá primero sus recibos para revertir los cobros.',
          400
        );
      }

      // Un borrador no generó movimientos, así que no hay nada que revertir.
      if (existingInvoice.status !== 'DRAFT') {
        const stockRepository = container.resolve<IStockRepository>('StockRepository');
        const remitoRepository = container.resolve<IRemitoRepository>('RemitoRepository');
        const stockBehavior: string = (existingInvoice as any).stockBehavior ?? 'DISCOUNT';
        const isFactura = existingInvoice.type.startsWith('FACTURA');
        const usesCC = effectiveSaleCondition((existingInvoice as any).saleCondition, (existingInvoice as any).paymentTerms) === 'CUENTA_CORRIENTE';

        // Lecturas previas (no necesitan la transacción)
        const currentAccount = usesCC
          ? await currentAccountRepository.findByCustomerId(
              existingInvoice.customerId,
              existingInvoice.currency,
              ((existingInvoice as any).fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL'
            )
          : null;
        const linkedRemitos = await prisma.remito.findMany({
          where: { invoiceId: existingInvoice.id },
          include: { items: true },
        });
        const activeRemitos = linkedRemitos.filter((r) => r.status !== 'CANCELLED');
        const saleMovements = isFactura && stockBehavior === 'DISCOUNT'
          ? await prisma.stockMovement.findMany({
              where: { referenceId: existingInvoice.id, type: 'SALE' },
            })
          : [];
        const defaultWarehouse = isFactura && stockBehavior === 'RESERVE'
          ? await resolveSaleWarehouse('invoices', existingInvoice.id, req.companyId)
          : null;

        // Toda la reversa (CC + stock + remitos + estado) se confirma o
        // revierte junta: una anulación a medias es peor que ninguna.
        await prisma.$transaction(async (tx) => {
          // Reverse current account movement only for cuenta corriente (incl. pago a X días)
          if (currentAccount) {
            const wasCredit = existingInvoice.type.startsWith('NOTA_CREDITO');
            await currentAccountRepository.addMovement({
              currentAccountId: currentAccount.id,
              type: wasCredit ? 'DEBIT' : 'CREDIT',
              amount: existingInvoice.total.toNumber(),
              description: `Cancelled: ${existingInvoice.type} ${existingInvoice.number}`,
              invoiceId: existingInvoice.id,
            }, tx);
          }

          // Reversa de stock. La emisión descontó (SALE) o reservó stock y
          // pudo generar un remito automático; todo debe volver.
          if (isFactura && stockBehavior === 'DISCOUNT') {
            // Los SALE originales conservan producto/variante/almacén exactos.
            for (const mov of saleMovements) {
              await stockRepository.addMovement({
                productId: mov.productId,
                variantId: (mov as any).variantId ?? null,
                warehouseId: mov.warehouseId,
                type: 'RETURN',
                quantity: Number(mov.quantity),
                reason: `Anulación factura ${existingInvoice.number}`,
                referenceId: existingInvoice.id,
                userId: req.user!.userId,
              }, tx);
            }
          } else if (isFactura && defaultWarehouse) {
            // RESERVE: liberar lo aún reservado y devolver lo ya entregado.
            // Cantidades que pasaron por algún remito (activo o ya cancelado):
            // su reserva ya fue liberada al entregarse o al cancelarse.
            const managedByRemito = new Map<string, number>();
            for (const remito of linkedRemitos) {
              for (const item of remito.items) {
                const key = `${item.productId}|${(item as any).variantId ?? ''}`;
                managedByRemito.set(key, (managedByRemito.get(key) ?? 0) + Number(item.quantity));
              }
            }

            for (const remito of activeRemitos) {
              for (const item of remito.items) {
                const variantId = (item as any).variantId ?? null;
                const delivered = Number(item.deliveredQuantity);
                const pending = Number(item.quantity) - delivered;
                if (pending > 0) {
                  await stockRepository.decrementReserved(
                    item.productId,
                    defaultWarehouse.id,
                    pending,
                    variantId,
                    tx,
                  );
                }
                if (delivered > 0) {
                  await stockRepository.addMovement({
                    productId: item.productId,
                    variantId,
                    warehouseId: defaultWarehouse.id,
                    type: 'RETURN',
                    quantity: delivered,
                    reason: `Anulación factura ${existingInvoice.number}`,
                    referenceId: remito.id,
                    userId: req.user!.userId,
                  }, tx);
                }
              }
            }

            // Reserva de la factura que nunca pasó por un remito.
            for (const item of existingInvoice.items) {
              const variantId = (item as any).variantId ?? null;
              const key = `${item.productId}|${variantId ?? ''}`;
              const remainder = Number(item.quantity) - (managedByRemito.get(key) ?? 0);
              if (remainder > 0) {
                await stockRepository.decrementReserved(
                  item.productId,
                  defaultWarehouse.id,
                  remainder,
                  variantId,
                  tx,
                );
              }
            }
          }

          // Los remitos vinculados quedan cancelados: la mercadería ya volvió.
          for (const remito of activeRemitos) {
            await remitoRepository.updateStatus(remito.id, 'CANCELLED', tx);
          }

          await tx.invoice.update({
            where: { id: existingInvoice.id },
            data: { status: 'CANCELLED' },
          });
        }, { timeout: 30000 });
      } else {
        await invoiceRepository.update(req.params.id, { status: 'CANCELLED' });
      }

      const invoice = await invoiceRepository.findById(req.params.id, req.companyId);

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

  /**
   * Elimina una factura en borrador. Solo se permite en estado DRAFT (todavía no
   * generó movimientos). Limpia cualquier vínculo residual por las dudas y borra
   * los ítems (cascade) + la factura.
   */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceRepository = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const existingInvoice = await invoiceRepository.findById(req.params.id, req.companyId);
      if (!existingInvoice || (existingInvoice as any).companyId !== req.companyId) {
        throw new NotFoundError('Invoice');
      }
      if (existingInvoice.status !== 'DRAFT') {
        throw new AppError('Solo se pueden eliminar facturas en borrador. Para una factura emitida usá Anular.', 400);
      }

      const id = req.params.id;
      // Limpieza defensiva de vínculos (un borrador normal no tiene ninguno).
      await prisma.$executeRaw`DELETE FROM "account_movements" WHERE "invoiceId" = ${id}`;
      await prisma.$executeRaw`DELETE FROM "remito_items" WHERE "remitoId" IN (SELECT id FROM "remitos" WHERE "invoiceId" = ${id})`;
      await prisma.$executeRaw`DELETE FROM "remitos" WHERE "invoiceId" = ${id}`;
      await prisma.$executeRaw`DELETE FROM "stock_movements" WHERE "referenceId" = ${id}`;
      await prisma.$executeRaw`DELETE FROM "invoices" WHERE id = ${id}`; // invoice_items cascade

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'DELETE',
        entity: 'Invoice',
        entityId: id,
        description: `Factura ${existingInvoice.number} (borrador) eliminada`,
      });

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
