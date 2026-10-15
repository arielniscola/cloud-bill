import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { randomUUID as uuidv4 } from 'crypto';
import { z } from 'zod';
import { IAppSettingsRepository } from '../../../domain/repositories/IAppSettingsRepository';
import { IReciboRepository } from '../../../domain/repositories/IReciboRepository';
import { IInvoiceRepository } from '../../../domain/repositories/IInvoiceRepository';
import { IBudgetRepository } from '../../../domain/repositories/IBudgetRepository';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { MercadoPagoService } from '../../services/MercadoPagoService';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import prisma from '../../database/prisma';
import { invoicePending, recalcInvoiceStatus } from '../../services/CustomerSettlementService';

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

const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * URL a la que MP avisa el pago. Lleva la empresa porque el webhook no tiene
 * sesión: sin ella no sabría con qué credenciales consultar el pago.
 */
function notificationUrlFor(companyId: string): string {
  const base = process.env.BASE_URL ?? 'http://localhost:3000';
  return `${base}/api/mercadopago/webhook?companyId=${encodeURIComponent(companyId)}`;
}

/**
 * Serializa el procesamiento de un mismo pago de MP. MP reintenta y suele
 * mandar el mismo aviso en paralelo: sin esto, dos entregas pasaban juntas el
 * chequeo "¿ya hay recibo?" y generaban dos. El lock vive lo que dura la
 * transacción que lo toma; `fn` trabaja con sus propias conexiones.
 */
async function withPaymentLock<T>(paymentId: string, fn: () => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mp-payment:${paymentId}`})::bigint)`;
      return fn();
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
}

async function paymentAlreadyRegistered(paymentId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "recibos" WHERE "mpPaymentId" = ${paymentId} LIMIT 1
  `;
  return rows.length > 0;
}

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
        const invoice = await invoiceRepo.findById(body.invoiceId, companyId);
        if (!invoice) throw new NotFoundError('Factura');
        if (invoice.status === 'PAID')      throw new AppError('La factura ya está pagada', 400);
        if (invoice.status === 'CANCELLED') throw new AppError('La factura está cancelada', 400);
        amount     = await invoicePending(invoice);
        title      = `Factura ${invoice.number}`;
        externalRef = invoice.id;
        customerId  = invoice.customerId;
        type        = 'INVOICE';
      } else if (body.budgetId) {
        const budget = await budgetRepo.findById(body.budgetId, companyId);
        if (!budget) throw new NotFoundError('Presupuesto');
        const activeRecibos = await prisma.recibo.findMany({ where: { budgetId: budget.id, status: 'EMITTED' } });
        const paid = activeRecibos.reduce((s: number, r: any) => s + Number(r.amount), 0);
        amount     = Number(budget.total) - paid;
        title      = `Presupuesto ${budget.number}`;
        externalRef = budget.id;
        customerId  = budget.customerId ?? '';
        type        = 'BUDGET';
      } else if (body.ordenPedidoId) {
        const op = await prisma.ordenPedido.findFirst({ where: { id: body.ordenPedidoId, companyId } });
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

      const notificationUrl = notificationUrlFor(companyId);
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

  /** POST /api/mercadopago/qr — create a presential dynamic QR (posnet) for invoice/budget/OP */
  async createQrOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settingsRepo = container.resolve<IAppSettingsRepository>('AppSettingsRepository');
      const invoiceRepo  = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const budgetRepo   = container.resolve<IBudgetRepository>('BudgetRepository');
      const companyId    = req.companyId ?? '00000000-0000-0000-0000-000000000001';

      const settings = await (settingsRepo as any).get(companyId);
      if (!settings?.mpAccessToken) {
        throw new AppError('MercadoPago no está configurado. Ingresá el Access Token en Configuración.', 400);
      }
      if (!settings?.mpPosId) {
        throw new AppError('Falta el ID de caja (POS) de MercadoPago. Configuralo en Configuración → Pagos para usar el QR presencial.', 400);
      }

      const body = createPreferenceSchema.parse(req.body);
      if (!body.invoiceId && !body.budgetId && !body.ordenPedidoId) {
        throw new AppError('Debe especificar invoiceId, budgetId o ordenPedidoId', 400);
      }

      let amount = 0;
      let title = '';
      let externalRef = '';
      let customerId = '';
      let type = 'INVOICE';

      if (body.invoiceId) {
        const invoice = await invoiceRepo.findById(body.invoiceId, companyId);
        if (!invoice) throw new NotFoundError('Factura');
        if (invoice.status === 'PAID')      throw new AppError('La factura ya está pagada', 400);
        if (invoice.status === 'CANCELLED') throw new AppError('La factura está cancelada', 400);
        amount = await invoicePending(invoice);
        title = `Factura ${invoice.number}`;
        externalRef = invoice.id;
        customerId = invoice.customerId;
        type = 'INVOICE';
      } else if (body.budgetId) {
        const budget = await budgetRepo.findById(body.budgetId, companyId);
        if (!budget) throw new NotFoundError('Presupuesto');
        const activeRecibos = await prisma.recibo.findMany({ where: { budgetId: budget.id, status: 'EMITTED' } });
        const paid = activeRecibos.reduce((s: number, r: any) => s + Number(r.amount), 0);
        amount = Number(budget.total) - paid;
        title = `Presupuesto ${budget.number}`;
        externalRef = budget.id;
        customerId = budget.customerId ?? '';
        type = 'BUDGET';
      } else if (body.ordenPedidoId) {
        const op = await prisma.ordenPedido.findFirst({ where: { id: body.ordenPedidoId, companyId } });
        if (!op) throw new NotFoundError('Orden de Pedido');
        const activeRecibos = await prisma.recibo.findMany({ where: { ordenPedidoId: op.id, status: 'EMITTED' } });
        const paid = activeRecibos.reduce((s: number, r: any) => s + Number(r.amount), 0);
        amount = Number(op.total) - paid;
        title = `Orden de Pedido ${op.number}`;
        externalRef = op.id;
        customerId = op.customerId ?? '';
        type = 'ORDEN_PEDIDO';
      }

      if (amount <= 0) throw new AppError('El saldo pendiente es 0', 400);

      const notificationUrl = notificationUrlFor(companyId);
      const mpService = new MercadoPagoService(settings.mpAccessToken);
      const qr = await mpService.createQrOrder({
        posId:             settings.mpPosId,
        externalReference: externalRef,
        title,
        amount,
        notificationUrl,
      });

      // El webhook matchea por externalReference; preferenceId sólo debe ser único y no nulo.
      const preferenceId = qr.inStoreOrderId ?? `QR-${uuidv4()}`;
      await prisma.$executeRaw`
        INSERT INTO "mp_preferences" ("id","preferenceId","externalReference","type","amount","customerId","userId","cashRegisterId","notes","status","companyId","createdAt","updatedAt")
        VALUES (
          ${uuidv4()}, ${preferenceId}, ${externalRef}, ${type},
          ${amount}, ${customerId}, ${req.user!.userId},
          ${body.cashRegisterId ?? null}, ${body.notes ?? null},
          'PENDING', ${companyId}, NOW(), NOW()
        )
      `;

      res.json({
        status: 'success',
        data: {
          qrData:         qr.qrData,
          inStoreOrderId: qr.inStoreOrderId,
          amount,
          title,
          mode:           settings.mpMode,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/mercadopago/webhook — receives MP IPN notifications (no auth) */
  async webhook(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      // Always respond 200 quickly so MP doesn't retry
      res.status(200).json({ status: 'ok' });

      const { type, data, action } = req.body ?? {};
      if ((type !== 'payment' && action !== 'payment.updated' && action !== 'payment.created') || !data?.id) {
        return;
      }

      // La empresa viaja en la URL de notificación (ver notificationUrlFor). Las
      // preferencias creadas antes de eso no la traen: caen a la empresa por defecto.
      const queryCompany = typeof req.query.companyId === 'string' ? req.query.companyId : '';
      const companyId = UUID.test(queryCompany) ? queryCompany : DEFAULT_COMPANY_ID;
      const settingsRepo = container.resolve<IAppSettingsRepository>('AppSettingsRepository');
      const settings = await (settingsRepo as any).get(companyId);
      if (!settings?.mpAccessToken) return;

      // Con el secret configurado la firma es obligatoria: un aviso sin firma o
      // con firma inválida se descarta. MP firma el `data.id` del query string.
      if (settings.mpWebhookSecret) {
        const xSig = req.headers['x-signature'] as string | undefined;
        const xReq = req.headers['x-request-id'] as string | undefined;
        const signedId = typeof req.query['data.id'] === 'string' ? req.query['data.id'] : String(data.id);
        if (!xSig || !xReq || !MercadoPagoService.verifySignature(xSig, xReq, signedId, settings.mpWebhookSecret)) {
          console.warn('[MP Webhook] Firma ausente o inválida — aviso descartado');
          return;
        }
      }

      const mpService = new MercadoPagoService(settings.mpAccessToken);
      const payment = await mpService.getPayment(data.id);

      if (payment.status !== 'approved') return;

      await withPaymentLock(String(payment.id), () =>
        MercadoPagoController._registerWebhookPayment(payment, companyId)
      );
    } catch (err) {
      console.error('[MP Webhook] Error:', err);
    }
  }

  /** Registra el recibo de un pago aprobado. Se llama con el lock del pago tomado. */
  private static async _registerWebhookPayment(payment: any, companyId: string): Promise<void> {
      if (await paymentAlreadyRegistered(String(payment.id))) return; // idempotente

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
        await MercadoPagoController._recalcOrdenPedido(pref.externalReference, companyId);
      }

      // Mark preference as completed
      await prisma.$executeRaw`
        UPDATE "mp_preferences" SET "status" = 'COMPLETED', "updatedAt" = NOW()
        WHERE "id" = ${pref.id}
      `;

      await activityRepo.create({
        entity:     'Recibo',
        entityId:   recibo.id,
        action:     'PAYMENT',
        description: `Pago MP aprobado #${payment.id} — $${amount}`,
        userId:     pref.userId,
        companyId,
      }).catch(() => {});
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
          SELECT "mpPaymentId" FROM "recibos"
          WHERE "mpPaymentId" = ANY(${paymentIds})
            AND "companyId" = ${req.companyId ?? DEFAULT_COMPANY_ID}
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
      if (!body.invoiceId && !body.budgetId && !body.ordenPedidoId) {
        throw new AppError('Debe especificar invoiceId, budgetId o ordenPedidoId', 400);
      }
      const invoiceRepo = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const budgetRepo  = container.resolve<IBudgetRepository>('BudgetRepository');

      const mpService = new MercadoPagoService(settings.mpAccessToken);
      const payment   = await mpService.getPayment(body.mpPaymentId);
      if (payment.status !== 'approved') {
        throw new AppError(`El pago MP no está aprobado (estado: ${payment.status})`, 400);
      }

      const recibo = await withPaymentLock(body.mpPaymentId, () =>
        MercadoPagoController._linkPayment(req, body, payment.amount, companyId, invoiceRepo, budgetRepo)
      );

      res.json({ status: 'success', data: recibo });
    } catch (err) {
      next(err);
    }
  }

  /** Crea el recibo de un pago vinculado a mano. Se llama con el lock del pago tomado. */
  private static async _linkPayment(
    req: Request,
    body: z.infer<typeof linkPaymentSchema>,
    paymentAmount: number,
    companyId: string,
    invoiceRepo: IInvoiceRepository,
    budgetRepo: IBudgetRepository
  ): Promise<any> {
      const reciboRepo  = container.resolve<IReciboRepository>('ReciboRepository');
      const currentAccountRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');

      if (await paymentAlreadyRegistered(body.mpPaymentId)) {
        throw new AppError('Este pago de MercadoPago ya fue vinculado', 400);
      }

      let amount     = paymentAmount;
      let customerId = '';

      if (body.invoiceId) {
        const invoice = await invoiceRepo.findById(body.invoiceId, companyId);
        if (!invoice) throw new NotFoundError('Factura');
        const remaining = await invoicePending(invoice);
        if (remaining <= 0) throw new AppError('La factura ya está pagada', 400);
        amount = Math.min(amount, remaining);
        customerId = invoice.customerId;
      } else if (body.budgetId) {
        const budget = await budgetRepo.findById(body.budgetId, companyId);
        if (!budget) throw new NotFoundError('Presupuesto');
        customerId = budget.customerId ?? '';
      } else if (body.ordenPedidoId) {
        const op = await prisma.ordenPedido.findFirst({ where: { id: body.ordenPedidoId, companyId } });
        if (!op) throw new NotFoundError('Orden de Pedido');
        customerId = op.customerId ?? '';
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
      } else if (body.ordenPedidoId) {
        await MercadoPagoController._recalcOrdenPedido(body.ordenPedidoId, companyId);
      }

      return recibo;
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
    const invoice = await invoiceRepo.findById(invoiceId, companyId);
    if (!invoice) return;
    await recalcInvoiceStatus(invoiceId, prisma);

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
      } catch (err) {
        // El cobro ya quedó registrado; que al menos se vea si la cuenta corriente no se acreditó.
        console.error(`[MP] No se pudo acreditar en cuenta corriente el recibo ${recibo.number}:`, err);
      }
    }
  }

  private static async _recalcBudget(budgetId: string, recibo: any, companyId: string) {
    const activeRecibos = await prisma.recibo.findMany({ where: { budgetId, status: 'EMITTED' } });
    const budget = await prisma.$queryRaw<any[]>`SELECT * FROM "budgets" WHERE id = ${budgetId} AND "companyId" = ${companyId} LIMIT 1`;
    if (!budget.length) return;
    const totalPaid = activeRecibos.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const total = Number(budget[0].total);
    const newStatus = totalPaid >= total - 0.001 ? 'PAID' : 'PARTIALLY_PAID';
    await prisma.$executeRaw`UPDATE "budgets" SET "status" = ${newStatus}::"BudgetStatus", "updatedAt" = NOW() WHERE id = ${budgetId}`;
  }

  private static async _recalcOrdenPedido(ordenPedidoId: string, companyId: string) {
    const activeRecibos = await prisma.recibo.findMany({ where: { ordenPedidoId, status: 'EMITTED' } });
    const op = await prisma.$queryRaw<any[]>`
      SELECT * FROM "orden_pedidos" WHERE id = ${ordenPedidoId} AND "companyId" = ${companyId} LIMIT 1
    `;
    if (!op.length) return;
    const totalPaid = activeRecibos.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const total = Number(op[0].total);
    const newStatus = totalPaid >= total - 0.001 ? 'PAID' : 'PARTIALLY_PAID';
    await prisma.$executeRaw`UPDATE "orden_pedidos" SET "status" = ${newStatus}, "updatedAt" = NOW() WHERE id = ${ordenPedidoId}`;
  }
}
