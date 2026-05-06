import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { v4: uuidv4 } = require('uuid');
import { z } from 'zod';
import { IAppSettingsRepository } from '../../../domain/repositories/IAppSettingsRepository';
import { IReciboRepository } from '../../../domain/repositories/IReciboRepository';
import { IInvoiceRepository } from '../../../domain/repositories/IInvoiceRepository';
import { IBudgetRepository } from '../../../domain/repositories/IBudgetRepository';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { ICashRegisterRepository } from '../../../domain/repositories/ICashRegisterRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { MercadoPagoService } from '../../services/MercadoPagoService';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import prisma from '../../database/prisma';

const createPreferenceSchema = z.object({
  invoiceId:      z.string().optional(),
  budgetId:       z.string().optional(),
  ordenPedidoId:  z.string().optional(),
  cashRegisterId: z.string().uuid().optional().nullable(),
  notes:          z.string().optional().nullable(),
});

const linkPaymentSchema = z.object({
  mpPaymentId:    z.string().min(1),
  invoiceId:      z.string().optional(),
  budgetId:       z.string().optional(),
  ordenPedidoId:  z.string().optional(),
  cashRegisterId: z.string().uuid().optional().nullable(),
  notes:          z.string().optional().nullable(),
});

export class MercadoPagoController {
  /** GET /api/mercadopago/status — check if MP is configured */
  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settingsRepo = container.resolve<IAppSettingsRepository>('AppSettingsRepository');
      const companyId = req.companyId ?? '00000000-0000-0000-0000-000000000001';
      const settings = await (settingsRepo as any).get(companyId);
      const configured = Boolean(settings?.mpAccessToken);
      res.json({
        status: 'success',
        data: {
          configured,
          mode: settings?.mpMode ?? 'test',
          publicKey: settings?.mpPublicKey ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/mercadopago/preference — create a payment preference for invoice/budget */
  async createPreference(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settingsRepo   = container.resolve<IAppSettingsRepository>('AppSettingsRepository');
      const invoiceRepo    = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const budgetRepo     = container.resolve<IBudgetRepository>('BudgetRepository');
      const companyId      = req.companyId ?? '00000000-0000-0000-0000-000000000001';

      const settings = await (settingsRepo as any).get(companyId);
      if (!settings?.mpAccessToken) {
        throw new AppError('MercadoPago no está configurado. Ingresá el Access Token en Configuración.', 400);
      }

      const body = createPreferenceSchema.parse(req.body);
      if (!body.invoiceId && !body.budgetId && !body.ordenPedidoId) {
        throw new AppError('Debe especificar invoiceId, budgetId o ordenPedidoId', 400);
      }

      let amount     = 0;
      let title      = '';
      let externalRef = '';
      let customerId = '';
      let type       = 'INVOICE';

      if (body.invoiceId) {
        const invoice = await invoiceRepo.findById(body.invoiceId);
        if (!invoice) throw new NotFoundError('Factura');
        if (invoice.status === 'PAID')      throw new AppError('La factura ya está pagada', 400);
        if (invoice.status === 'CANCELLED') throw new AppError('La factura está cancelada', 400);
        const activeRecibos = await prisma.recibo.findMany({ where: { invoiceId: invoice.id, status: 'EMITTED' } });
        const paid = activeRecibos.reduce((s: number, r: any) => s + Number(r.amount), 0);
        amount     = Number(invoice.total) - paid;
        title      = `Factura ${invoice.number}`;
        externalRef = invoice.id;
        customerId  = invoice.customerId;
        type        = 'INVOICE';
      } else if (body.budgetId) {
        const budget = await (budgetRepo as any).findById(body.budgetId);
        if (!budget) throw new NotFoundError('Presupuesto');
        const activeRecibos = await prisma.recibo.findMany({ where: { budgetId: budget.id, status: 'EMITTED' } });
        const paid = activeRecibos.reduce((s: number, r: any) => s + Number(r.amount), 0);
        amount     = Number(budget.total) - paid;
        title      = `Presupuesto ${budget.number}`;
        externalRef = budget.id;
        customerId  = budget.customerId;
        type        = 'BUDGET';
      } else if (body.ordenPedidoId) {
        const op = await prisma.ordenPedido.findUnique({ where: { id: body.ordenPedidoId } });
        if (!op) throw new NotFoundError('Orden de Pedido');
        const activeRecibos = await prisma.recibo.findMany({ where: { ordenPedidoId: op.id, status: 'EMITTED' } });
        const paid = activeRecibos.reduce((s: number, r: any) => s + Number(r.amount), 0);
        amount     = Number(op.total) - paid;
        title      = `Orden de Pedido ${op.number}`;
        externalRef = op.id;
        customerId  = op.customerId ?? '';
        type        = 'ORDEN_PEDIDO';
      }

      if (amount <= 0) throw new AppError('El saldo pendiente es 0', 400);

      const notificationUrl = `${process.env.BASE_URL ?? 'http://localhost:3000'}/api/mercadopago/webhook`;
      const mpService = new MercadoPagoService(settings.mpAccessToken);
      const preference = await mpService.createPreference({
        externalReference: externalRef,
        title,
        amount,
        notificationUrl,
      });

      // Persist preference record
      await prisma.$executeRaw`
        INSERT INTO "mp_preferences" ("id","preferenceId","externalReference","type","amount","customerId","userId","cashRegisterId","notes","status","companyId","createdAt","updatedAt")
        VALUES (
          ${uuidv4()}, ${preference.id}, ${externalRef}, ${type},
          ${amount}, ${customerId}, ${req.user!.userId},
          ${body.cashRegisterId ?? null}, ${body.notes ?? null},
          'PENDING', ${companyId}, NOW(), NOW()
        )
      `;

      const payUrl = settings.mpMode === 'production' ? preference.initPoint : preference.sandboxInitPoint;

      res.json({
        status: 'success',
        data: {
          preferenceId:    preference.id,
          payUrl,
          initPoint:       preference.initPoint,
          sandboxInitPoint: preference.sandboxInitPoint,
          amount,
          title,
          mode:            settings.mpMode,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/mercadopago/webhook — receives MP IPN notifications (no auth) */
  async webhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Always respond 200 quickly so MP doesn't retry
      res.status(200).json({ status: 'ok' });

      const { type, data, action } = req.body ?? {};
      if ((type !== 'payment' && action !== 'payment.updated' && action !== 'payment.created') || !data?.id) {
        return;
      }

      // Determine companyId — try from query or use default (single-tenant for now)
      const companyId = (req.query.companyId as string) ?? '00000000-0000-0000-0000-000000000001';
      const settingsRepo = container.resolve<IAppSettingsRepository>('AppSettingsRepository');
      const settings = await (settingsRepo as any).get(companyId);
      if (!settings?.mpAccessToken) return;

      // Optionally verify signature
      const xSig = req.headers['x-signature'] as string | undefined;
      const xReq = req.headers['x-request-id'] as string | undefined;
      if (xSig && xReq && settings.mpWebhookSecret) {
        const valid = MercadoPagoService.verifySignature(xSig, xReq, String(data.id), settings.mpWebhookSecret);
        if (!valid) {
          console.warn('[MP Webhook] Invalid signature — ignored');
          return;
        }
      }

      const mpService = new MercadoPagoService(settings.mpAccessToken);
      const payment = await mpService.getPayment(data.id);

      if (payment.status !== 'approved') return;

      // Find the pending preference
      const prefs = await prisma.$queryRaw<any[]>`
        SELECT * FROM "mp_preferences"
        WHERE ("preferenceId" = ${payment.preferenceId ?? ''} OR "externalReference" = ${payment.externalReference ?? ''})
          AND "companyId" = ${companyId}
          AND "status" = 'PENDING'
        LIMIT 1
      `;
      if (!prefs.length) return;
      const pref = prefs[0];

      // Check if this payment was already registered
      const existingRecibo = await prisma.$queryRaw<any[]>`
        SELECT id FROM "recibos" WHERE "mpPaymentId" = ${String(payment.id)} LIMIT 1
      `;
      if (existingRecibo.length) return; // idempotent

      // Create the Recibo
      const reciboRepo = container.resolve<IReciboRepository>('ReciboRepository');
      const invoiceRepo = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const currentAccountRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
      const activityRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const amount = Math.min(Number(pref.amount), payment.amount);

      const recibo = await (reciboRepo as any).create({
        invoiceId:      pref.type === 'INVOICE'      ? pref.externalReference : null,
        budgetId:       pref.type === 'BUDGET'       ? pref.externalReference : null,
        ordenPedidoId:  pref.type === 'ORDEN_PEDIDO' ? pref.externalReference : null,
        customerId:     pref.customerId,
        userId:         pref.userId,
        cashRegisterId: null, // MP no impacta en caja física — el canal es la cuenta MP
        amount,
        currency:       'ARS',
        paymentMethod:  'MERCADO_PAGO',
        reference:      String(payment.id),
        notes:          pref.notes ?? `Pago automático via MercadoPago`,
        companyId,
      });

      // Store mpPaymentId on recibo
      await prisma.$executeRaw`
        UPDATE "recibos" SET "mpPaymentId" = ${String(payment.id)}, "mpPreferenceId" = ${payment.preferenceId ?? pref.preferenceId}
        WHERE id = ${recibo.id}
      `;

      // Update invoice/budget status
      if (pref.type === 'INVOICE') {
        await MercadoPagoController._recalcInvoice(pref.externalReference, invoiceRepo, currentAccountRepo, recibo, companyId);
      } else if (pref.type === 'BUDGET') {
        await MercadoPagoController._recalcBudget(pref.externalReference, recibo, companyId);
      } else if (pref.type === 'ORDEN_PEDIDO') {
        await MercadoPagoController._recalcOrdenPedido(pref.externalReference, recibo);
      }

      // Mark preference as completed
      await prisma.$executeRaw`
        UPDATE "mp_preferences" SET "status" = 'COMPLETED', "updatedAt" = NOW()
        WHERE "id" = ${pref.id}
      `;

      await (activityRepo as any).create({
        entityType: 'RECIBO',
        entityId:   recibo.id,
        action:     'PAYMENT_RECEIVED_MP',
        description: `Pago MP aprobado #${payment.id} — $${amount}`,
        userId:     pref.userId,
        companyId,
      }).catch(() => {});
    } catch (err) {
      console.error('[MP Webhook] Error:', err);
    }
  }

  /** GET /api/mercadopago/balance */
  async getBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await MercadoPagoController._getSettings(req);
      const mpService = new MercadoPagoService(settings.mpAccessToken);
      const balance = await mpService.getBalance();
      res.json({ status: 'success', data: balance ?? null });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/mercadopago/movements */
  async getMovements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await MercadoPagoController._getSettings(req);
      const { from, to, limit = '20', offset = '0' } = req.query as Record<string, string>;
      const mpService = new MercadoPagoService(settings.mpAccessToken);
      const result = await mpService.getMovements({
        from,
        to,
        limit:  Number(limit),
        offset: Number(offset),
      });

      // Enrich: check which movements have a linked Recibo (by mpPaymentId)
      const paymentIds = result.results.filter(m => m.sourceId).map(m => String(m.sourceId));
      let linkedIds: string[] = [];
      if (paymentIds.length) {
        const rows = await prisma.$queryRaw<any[]>`
          SELECT "mpPaymentId" FROM "recibos" WHERE "mpPaymentId" = ANY(${paymentIds})
        `;
        linkedIds = rows.map((r: any) => r.mpPaymentId);
      }

      const enriched = result.results.map(m => ({
        ...m,
        linked: m.sourceId ? linkedIds.includes(String(m.sourceId)) : false,
      }));

      res.json({ status: 'success', data: { results: enriched, total: result.total } });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/mercadopago/link-payment — manually link a MP payment ID to an invoice/budget */
  async linkPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings    = await MercadoPagoController._getSettings(req);
      const companyId   = req.companyId ?? '00000000-0000-0000-0000-000000000001';
      const body        = linkPaymentSchema.parse(req.body);
      const invoiceRepo = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const reciboRepo  = container.resolve<IReciboRepository>('ReciboRepository');
      const currentAccountRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');

      // Check not already linked
      const existing = await prisma.$queryRaw<any[]>`
        SELECT id FROM "recibos" WHERE "mpPaymentId" = ${body.mpPaymentId} LIMIT 1
      `;
      if (existing.length) throw new AppError('Este pago de MercadoPago ya fue vinculado', 400);

      const mpService = new MercadoPagoService(settings.mpAccessToken);
      const payment   = await mpService.getPayment(body.mpPaymentId);
      if (payment.status !== 'approved') {
        throw new AppError(`El pago MP no está aprobado (estado: ${payment.status})`, 400);
      }

      let amount     = payment.amount;
      let customerId = '';

      if (body.invoiceId) {
        const invoice = await invoiceRepo.findById(body.invoiceId);
        if (!invoice) throw new NotFoundError('Factura');
        const activeRecibos = await prisma.recibo.findMany({ where: { invoiceId: invoice.id, status: 'EMITTED' } });
        const paid = activeRecibos.reduce((s: number, r: any) => s + Number(r.amount), 0);
        const remaining = Number(invoice.total) - paid;
        if (remaining <= 0) throw new AppError('La factura ya está pagada', 400);
        amount = Math.min(amount, remaining);
        customerId = invoice.customerId;
      } else if (body.budgetId) {
        const budget = await (container.resolve<IBudgetRepository>('BudgetRepository') as any).findById(body.budgetId);
        if (!budget) throw new NotFoundError('Presupuesto');
        customerId = budget.customerId;
      }

      const recibo = await (reciboRepo as any).create({
        invoiceId:      body.invoiceId      ?? null,
        budgetId:       body.budgetId       ?? null,
        ordenPedidoId:  body.ordenPedidoId  ?? null,
        customerId,
        userId:         req.user!.userId,
        cashRegisterId: null, // MP no impacta en caja física
        amount,
        currency:       'ARS',
        paymentMethod:  'MERCADO_PAGO',
        reference:      body.mpPaymentId,
        notes:          body.notes ?? `Vinculado manualmente — MP #${body.mpPaymentId}`,
        companyId,
      });

      await prisma.$executeRaw`
        UPDATE "recibos" SET "mpPaymentId" = ${body.mpPaymentId} WHERE id = ${recibo.id}
      `;

      if (body.invoiceId) {
        await MercadoPagoController._recalcInvoice(body.invoiceId, invoiceRepo, currentAccountRepo, recibo, companyId);
      } else if (body.budgetId) {
        await MercadoPagoController._recalcBudget(body.budgetId, recibo, companyId);
      }

      res.json({ status: 'success', data: recibo });
    } catch (err) {
      next(err);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────

  private static async _getSettings(req: Request) {
    const settingsRepo = container.resolve<IAppSettingsRepository>('AppSettingsRepository');
    const companyId = req.companyId ?? '00000000-0000-0000-0000-000000000001';
    const settings = await (settingsRepo as any).get(companyId);
    if (!settings?.mpAccessToken) {
      throw new AppError('MercadoPago no está configurado. Ingresá el Access Token en Configuración.', 400);
    }
    return settings;
  }

  private static async _recalcInvoice(
    invoiceId: string,
    invoiceRepo: IInvoiceRepository,
    currentAccountRepo: ICurrentAccountRepository,
    recibo: any,
    companyId: string
  ) {
    const invoice = await invoiceRepo.findById(invoiceId);
    if (!invoice) return;
    const activeRecibos = await prisma.recibo.findMany({ where: { invoiceId, status: 'EMITTED' } });
    const totalPaid = activeRecibos.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const total = Number(invoice.total);
    const newStatus = totalPaid >= total - 0.001 ? 'PAID' : 'PARTIALLY_PAID';
    await (invoiceRepo as any).updateStatus(invoiceId, newStatus);

    if ((invoice as any).saleCondition === 'CUENTA_CORRIENTE') {
      try {
        const movement = await (currentAccountRepo as any).addMovement({
          customerId:  invoice.customerId,
          currency:    invoice.currency ?? 'ARS',
          type:        'CREDIT',
          amount:      recibo.amount,
          description: `Pago MP Factura ${invoice.number} - REC ${recibo.number}`,
          invoiceId,
          cashRegisterId: recibo.cashRegisterId ?? null,
          companyId,
        });
        await prisma.$executeRaw`UPDATE "account_movements" SET "reciboId" = ${recibo.id} WHERE id = ${movement.id}`;
      } catch {}
    }
  }

  private static async _recalcBudget(budgetId: string, recibo: any, companyId: string) {
    const activeRecibos = await prisma.recibo.findMany({ where: { budgetId, status: 'EMITTED' } });
    const budget = await prisma.$queryRaw<any[]>`SELECT * FROM "budgets" WHERE id = ${budgetId} LIMIT 1`;
    if (!budget.length) return;
    const totalPaid = activeRecibos.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const total = Number(budget[0].total);
    const newStatus = totalPaid >= total - 0.001 ? 'PAID' : 'PARTIALLY_PAID';
    await prisma.$executeRaw`UPDATE "budgets" SET "status" = ${newStatus}::"BudgetStatus", "updatedAt" = NOW() WHERE id = ${budgetId}`;
  }

  private static async _recalcOrdenPedido(ordenPedidoId: string, recibo: any) {
    const activeRecibos = await prisma.recibo.findMany({ where: { ordenPedidoId, status: 'EMITTED' } });
    const op = await prisma.$queryRaw<any[]>`SELECT * FROM "orden_pedidos" WHERE id = ${ordenPedidoId} LIMIT 1`;
    if (!op.length) return;
    const totalPaid = activeRecibos.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const total = Number(op[0].total);
    const newStatus = totalPaid >= total - 0.001 ? 'PAID' : 'PARTIALLY_PAID';
    await prisma.$executeRaw`UPDATE "orden_pedidos" SET "status" = ${newStatus}, "updatedAt" = NOW() WHERE id = ${ordenPedidoId}`;
  }
}
