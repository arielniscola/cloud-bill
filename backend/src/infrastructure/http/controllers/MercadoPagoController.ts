import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { randomUUID as uuidv4 } from 'crypto';
import { z } from 'zod';
import { IAppSettingsRepository } from '../../../domain/repositories/IAppSettingsRepository';
import { IReciboRepository } from '../../../domain/repositories/IReciboRepository';
import { IInvoiceRepository } from '../../../domain/repositories/IInvoiceRepository';
import { IBudgetRepository } from '../../../domain/repositories/IBudgetRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { Prisma } from '@prisma/client';
import { MercadoPagoService } from '../../services/MercadoPagoService';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import prisma from '../../database/prisma';
import { invoicePending, recalcInvoiceStatus, lockInvoiceRow } from '../../services/CustomerSettlementService';
import { addCustomerMovement } from '../../services/customerAccountMovements';
import { effectiveSaleCondition } from '../../../shared/utils/paymentTerms';
import { resolveConsumidorFinalCustomerId } from '../../../shared/utils/consumidorFinal';
import { round2 } from '../../../shared/utils/money';
import { leaveDraftIfNeeded } from './InvoiceController';

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
async function withPaymentLock<T>(paymentId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mp-payment:${paymentId}`})::bigint)`;
      return fn(tx);
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
}

async function paymentAlreadyRegistered(paymentId: string, client: Tx | typeof prisma = prisma): Promise<boolean> {
  const rows = await client.$queryRaw<{ id: string }[]>`
    SELECT id FROM "recibos" WHERE "mpPaymentId" = ${paymentId} LIMIT 1
  `;
  return rows.length > 0;
}

type Tx = Prisma.TransactionClient;
type TargetKind = 'INVOICE' | 'BUDGET' | 'ORDEN_PEDIDO';

interface LockedTarget {
  /** Lo que el documento todavía admite cobrar (0 si está saldado o bloqueado). */
  pending: number;
  /** Por qué no admite cobros, o null si se puede cobrar. */
  blocked: string | null;
  customerId: string | null;
  label: string;
  invoice: any | null;
}

/**
 * Bloquea el documento a cobrar (FOR UPDATE) y calcula su saldo con la fila ya
 * tomada: un cobro manual o un segundo aviso que entren al mismo tiempo esperan
 * acá y ven el saldo real, no el de antes del primer recibo.
 */
async function lockTarget(kind: TargetKind, id: string, companyId: string, tx: Tx): Promise<LockedTarget> {
  if (kind === 'INVOICE') {
    await lockInvoiceRow(id, tx);
    const invoice = await tx.invoice.findFirst({ where: { id, companyId } });
    if (!invoice) return { pending: 0, blocked: 'el comprobante ya no existe', customerId: null, label: 'Factura', invoice: null };
    const label = `Factura ${invoice.number}`;
    let blocked: string | null = null;
    if (invoice.status === 'CANCELLED') blocked = `${label} está anulada`;
    else if (invoice.status === 'DRAFT') blocked = `${label} sigue en borrador`;
    else if (invoice.type.startsWith('NOTA_CREDITO')) blocked = 'una nota de crédito no se cobra';
    const pending = blocked ? 0 : Math.max(0, await invoicePending(invoice, tx));
    return { pending, blocked, customerId: invoice.customerId, label, invoice };
  }

  const rows = kind === 'BUDGET'
    ? await tx.$queryRaw<{ total: number; status: string; customerId: string | null; number: string }[]>`
        SELECT total::float8 AS total, status::text AS status, "customerId", number
        FROM "budgets" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`
    : await tx.$queryRaw<{ total: number; status: string; customerId: string | null; number: string }[]>`
        SELECT total::float8 AS total, status::text AS status, "customerId", number
        FROM "orden_pedidos" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
  const doc = rows[0];
  const name = kind === 'BUDGET' ? 'Presupuesto' : 'Orden de Pedido';
  if (!doc) return { pending: 0, blocked: `${name}: ya no existe`, customerId: null, label: name, invoice: null };

  const label = `${name} ${doc.number}`;
  const [{ paid }] = kind === 'BUDGET'
    ? await tx.$queryRaw<{ paid: number }[]>`
        SELECT COALESCE(SUM(amount), 0)::float8 AS paid FROM "recibos" WHERE "budgetId" = ${id} AND status = 'EMITTED'`
    : await tx.$queryRaw<{ paid: number }[]>`
        SELECT COALESCE(SUM(amount), 0)::float8 AS paid FROM "recibos" WHERE "ordenPedidoId" = ${id} AND status = 'EMITTED'`;
  const blocked = ['CANCELLED', 'REJECTED'].includes(doc.status) ? `${label} está anulado` : null;
  const pending = blocked ? 0 : Math.max(0, round2(Number(doc.total) - Number(paid)));
  return { pending, blocked, customerId: doc.customerId, label, invoice: null };
}

interface RegisterMpPayment {
  kind: TargetKind;
  targetId: string;
  companyId: string;
  userId: string;
  amount: number;
  paymentId: string;
  preferenceId?: string | null;
  notes?: string | null;
  /** Cobro manual: si el documento no admite el cobro se rechaza en vez de dejarlo a cuenta. */
  strict?: boolean;
}

/**
 * Registra un pago aprobado de MP dentro de la transacción `tx` (la del lock del
 * pago): recibo, cuenta corriente y estado del documento se confirman juntos.
 *
 * La plata ya entró a la cuenta de MP, así que nunca se descarta: lo que el
 * documento admite se le aplica, y lo que no (ya estaba saldado, anulado, o se
 * pagó de más) queda como pago a cuenta —saldo a favor del cliente—, igual que
 * un pago a cuenta cargado a mano.
 */
async function registerMpPayment(p: RegisterMpPayment, tx: Tx): Promise<{ applied: any | null; onAccount: any | null; target: LockedTarget }> {
  const reciboRepo = container.resolve<IReciboRepository>('ReciboRepository');
  const target = await lockTarget(p.kind, p.targetId, p.companyId, tx);

  if (p.strict) {
    if (target.blocked) throw new AppError(`No se puede vincular el pago: ${target.blocked}`, 400);
    if (target.pending <= 0.005) throw new AppError(`${target.label} ya está saldado`, 400);
  }

  const applied = round2(Math.min(p.amount, target.pending));
  const excess = round2(p.amount - applied);
  const customerId = target.customerId || (await resolveConsumidorFinalCustomerId(p.companyId));
  const fiscalMode = (target.invoice?.fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL';
  const ccCurrency = (target.invoice?.currency ?? 'ARS') as string;

  const base = {
    customerId,
    userId: p.userId,
    cashRegisterId: null, // MP no impacta en caja física — el canal es la cuenta MP
    currency: 'ARS',
    paymentMethod: 'MERCADO_PAGO',
    reference: p.paymentId,
    companyId: p.companyId,
    fiscalMode,
  };
  // El id del pago se estampa en UN solo recibo: es la marca de idempotencia.
  let stamped = false;
  const stamp = async (reciboId: string) => {
    if (stamped) return;
    stamped = true;
    await tx.$executeRaw`
      UPDATE "recibos" SET "mpPaymentId" = ${p.paymentId}, "mpPreferenceId" = ${p.preferenceId ?? null}
      WHERE id = ${reciboId}
    `;
  };

  let appliedRecibo: any = null;
  if (applied > 0.005) {
    appliedRecibo = await reciboRepo.create({
      ...base,
      invoiceId:     p.kind === 'INVOICE'      ? p.targetId : null,
      budgetId:      p.kind === 'BUDGET'       ? p.targetId : null,
      ordenPedidoId: p.kind === 'ORDEN_PEDIDO' ? p.targetId : null,
      amount: applied,
      notes: p.notes ?? 'Pago automático via MercadoPago',
    } as any, tx);
    await stamp(appliedRecibo.id);

    if (p.kind === 'INVOICE') {
      const inv = target.invoice;
      if (effectiveSaleCondition(inv.saleCondition, inv.paymentTerms) === 'CUENTA_CORRIENTE') {
        await addCustomerMovement({
          customerId: inv.customerId,
          currency: ccCurrency,
          fiscalMode,
          type: 'CREDIT',
          amount: applied,
          description: `Pago MP Factura ${inv.number} - REC ${appliedRecibo.number}`,
          invoiceId: inv.id,
          reciboId: appliedRecibo.id,
        }, tx);
      }
      await recalcInvoiceStatus(inv.id, tx, p.userId);
    } else {
      const status = applied >= target.pending - 0.005 ? 'PAID' : 'PARTIALLY_PAID';
      if (p.kind === 'BUDGET') {
        await tx.$executeRaw`UPDATE "budgets" SET "status" = ${status}::"BudgetStatus", "updatedAt" = NOW() WHERE id = ${p.targetId}`;
      } else {
        await tx.$executeRaw`UPDATE "orden_pedidos" SET "status" = ${status}, "updatedAt" = NOW() WHERE id = ${p.targetId}`;
      }
    }
  }

  let onAccount: any = null;
  if (excess > 0.005) {
    const why = target.blocked ?? (applied > 0.005 ? `excede lo pendiente de ${target.label}` : `${target.label} ya estaba saldado`);
    onAccount = await reciboRepo.create({
      ...base,
      invoiceId: null,
      amount: excess,
      notes: `Pago a cuenta — MercadoPago #${p.paymentId} (${why})`,
    } as any, tx);
    await stamp(onAccount.id);
    await addCustomerMovement({
      customerId,
      currency: 'ARS',
      fiscalMode,
      type: 'CREDIT',
      amount: excess,
      description: `Pago a cuenta ${onAccount.number} - MercadoPago #${p.paymentId}`,
      reciboId: onAccount.id,
    }, tx);
  }

  return { applied: appliedRecibo, onAccount, target };
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
    // Se responde DESPUÉS de procesar. Antes se contestaba 200 de entrada y un
    // error al registrar dejaba el pago cobrado en MP y sin recibo, sin que MP
    // reintentara. Con 500 MP vuelve a avisar, y el registro es idempotente
    // (lock por pago + mpPaymentId), así que el reintento no duplica.
    try {
      await MercadoPagoController._handleWebhook(req);
      res.status(200).json({ status: 'ok' });
    } catch (err) {
      console.error('[MP Webhook] Error — MP va a reintentar el aviso:', err);
      res.status(500).json({ status: 'error' });
    }
  }

  private static async _handleWebhook(req: Request): Promise<void> {
    {
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
      const paymentId = String(payment.id);

      // Si la factura sigue en borrador se emite antes de cobrarla, igual que
      // en el cobro manual. Va fuera de la transacción del pago porque la
      // emisión abre la suya. Si no se puede emitir (p.ej. sin stock) el pago se
      // registra igual, como pago a cuenta.
      const candidates = await prisma.$queryRaw<{ type: string; externalReference: string; userId: string }[]>`
        SELECT type, "externalReference", "userId" FROM "mp_preferences"
        WHERE ("preferenceId" = ${payment.preferenceId ?? ''} OR "externalReference" = ${payment.externalReference ?? ''})
          AND "companyId" = ${companyId} AND "status" = 'PENDING'
        LIMIT 1
      `;
      if (candidates[0]?.type === 'INVOICE') {
        const invoiceRepo = container.resolve<IInvoiceRepository>('InvoiceRepository');
        const draft = await invoiceRepo.findById(candidates[0].externalReference, companyId);
        if (draft?.status === 'DRAFT') {
          try {
            await leaveDraftIfNeeded(draft, {
              userId: candidates[0].userId,
              companyId,
              fiscalMode: (draft as any).fiscalMode ?? 'FORMAL',
            });
          } catch (err) {
            console.error(`[MP Webhook] No se pudo emitir el borrador ${draft.number}; el pago #${paymentId} queda a cuenta:`, err);
          }
        }
      }

      const outcome = await withPaymentLock(paymentId, async (tx) => {
        if (await paymentAlreadyRegistered(paymentId, tx)) return null; // idempotente

        const prefs = await tx.$queryRaw<any[]>`
          SELECT * FROM "mp_preferences"
          WHERE ("preferenceId" = ${payment.preferenceId ?? ''} OR "externalReference" = ${payment.externalReference ?? ''})
            AND "companyId" = ${companyId}
            AND "status" = 'PENDING'
          LIMIT 1
          FOR UPDATE
        `;
        if (!prefs.length) return null;
        const pref = prefs[0];

        const result = await registerMpPayment({
          kind: pref.type as TargetKind,
          targetId: pref.externalReference,
          companyId,
          userId: pref.userId,
          amount: Number(payment.amount),
          paymentId,
          preferenceId: payment.preferenceId ?? pref.preferenceId,
          notes: pref.notes ?? null,
        }, tx);

        await tx.$executeRaw`
          UPDATE "mp_preferences" SET "status" = 'COMPLETED', "updatedAt" = NOW()
          WHERE "id" = ${pref.id}
        `;
        return { ...result, userId: pref.userId as string };
      });
      if (!outcome) return;

      const activityRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      const { applied, onAccount, target, userId } = outcome;
      const parts = [
        applied ? `$${Number(applied.amount).toFixed(2)} aplicados a ${target.label} (${applied.number})` : null,
        onAccount ? `$${Number(onAccount.amount).toFixed(2)} a cuenta (${onAccount.number})` : null,
      ].filter(Boolean).join(' y ');
      await activityRepo.create({
        entity:     'Recibo',
        entityId:   (applied ?? onAccount).id,
        action:     'PAYMENT',
        description: `Pago MP aprobado #${paymentId} — ${parts}`,
        userId,
        companyId,
      } as any).catch((err) => console.error('[MP Webhook] No se pudo registrar la actividad:', err));
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

      // El documento tiene que ser de la empresa y admitir el cobro ANTES de
      // consultar el pago a MP.
      let kind: TargetKind;
      let targetId: string;
      if (body.invoiceId) {
        const invoice = await invoiceRepo.findById(body.invoiceId, companyId);
        if (!invoice) throw new NotFoundError('Factura');
        if (invoice.status === 'CANCELLED') throw new AppError('La factura está anulada', 400);
        if (invoice.type.startsWith('NOTA_CREDITO')) throw new AppError('Una nota de crédito no se cobra', 400);
        kind = 'INVOICE'; targetId = invoice.id;
      } else if (body.budgetId) {
        const budget = await budgetRepo.findById(body.budgetId, companyId);
        if (!budget) throw new NotFoundError('Presupuesto');
        kind = 'BUDGET'; targetId = budget.id;
      } else {
        const op = await prisma.ordenPedido.findFirst({ where: { id: body.ordenPedidoId!, companyId } });
        if (!op) throw new NotFoundError('Orden de Pedido');
        kind = 'ORDEN_PEDIDO'; targetId = op.id;
      }

      if (await paymentAlreadyRegistered(body.mpPaymentId)) {
        throw new AppError('Este pago de MercadoPago ya fue vinculado', 400);
      }

      const mpService = new MercadoPagoService(settings.mpAccessToken);
      const payment   = await mpService.getPayment(body.mpPaymentId);
      if (payment.status !== 'approved') {
        throw new AppError(`El pago MP no está aprobado (estado: ${payment.status})`, 400);
      }

      // Cobrar un borrador lo emite, como en el cobro manual de la factura.
      if (kind === 'INVOICE') {
        const invoice = await invoiceRepo.findById(targetId, companyId);
        await leaveDraftIfNeeded(invoice, { userId: req.user!.userId, companyId, fiscalMode: req.fiscalMode });
      }

      const result = await withPaymentLock(body.mpPaymentId, async (tx) => {
        if (await paymentAlreadyRegistered(body.mpPaymentId, tx)) {
          throw new AppError('Este pago de MercadoPago ya fue vinculado', 400);
        }
        return registerMpPayment({
          kind,
          targetId,
          companyId,
          userId: req.user!.userId,
          amount: Number(payment.amount),
          paymentId: body.mpPaymentId,
          notes: body.notes ?? `Vinculado manualmente — MP #${body.mpPaymentId}`,
          strict: true,
        }, tx);
      });

      res.json({
        status: 'success',
        data: result.applied,
        // Si el pago de MP era mayor que lo pendiente, el resto quedó a cuenta.
        ...(result.onAccount ? { onAccount: result.onAccount } : {}),
      });
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
}
