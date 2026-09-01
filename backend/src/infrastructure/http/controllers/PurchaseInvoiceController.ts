import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { IOrdenPagoRepository } from '../../../domain/repositories/IOrdenPagoRepository';

// ── Sub-schemas ──────────────────────────────────────────────────────────────

const itemSchema = z.object({
  description: z.string().min(1),
  quantity:    z.coerce.number().positive().default(1),
  unitPrice:   z.coerce.number().min(0),
  taxRate:     z.coerce.number().min(0).max(100).default(21),
});

// "Otros tributos" que SUMAN al total (percepciones, impuestos internos, otros)
const tribSchema = z.object({
  type:         z.string().default('PERCEPCION_IVA'), // PERCEPCION_IVA | PERCEPCION_IIBB | IMPUESTOS_INTERNOS | OTRO
  jurisdiction: z.string().optional().nullable(),
  base:         z.coerce.number().min(0).default(0),
  percentage:   z.coerce.number().min(0).max(100).default(0),
  amount:       z.coerce.number().min(0),
  description:  z.string().optional().nullable(),
});

// Campos comunes del comprobante
const baseInvoiceSchema = z.object({
  number:         z.string().min(1, 'El número es requerido'),
  type:           z.string().default('FACTURA_A'),
  subtotal:       z.coerce.number().min(0).default(0),
  taxRate:        z.coerce.number().min(0).max(100).default(21),
  taxAmount:      z.coerce.number().min(0).default(0),
  amount:         z.coerce.number().positive('El total debe ser positivo'),
  dueDate:        z.string().optional().nullable(),
  imputationDate: z.string().optional().nullable(),
  paymentMethod:  z.string().default('BANK_TRANSFER'),
  notes:          z.string().optional().nullable(),
  items:          z.array(itemSchema).optional().default([]),
  tributos:       z.array(tribSchema).optional().default([]),
});

// Factura standalone (documento de primer nivel, sin compra)
const standaloneSchema = baseInvoiceSchema.extend({
  supplierId:    z.string().uuid('Proveedor requerido'),
  currency:      z.string().default('ARS'),
  saleCondition: z.enum(['CONTADO', 'CUENTA_CORRIENTE']).default('CONTADO'),
  exchangeRate:  z.coerce.number().positive().default(1),
  date:          z.string().optional().nullable(),
  remitoIds:     z.array(z.string().uuid()).optional().default([]),
  originInvoiceId: z.string().uuid().optional().nullable(),  // NC/ND → factura de origen
});

const updateSchema = standaloneSchema.partial().extend({
  status: z.enum(['PENDING', 'PARTIALLY_PAID', 'PAID']).optional(),
});

const querySchema = z.object({
  page:          z.coerce.number().int().positive().default(1),
  limit:         z.coerce.number().int().positive().default(20),
  supplierId:    z.string().uuid().optional(),
  status:        z.enum(['PENDING', 'PARTIALLY_PAID', 'PAID']).optional(),
  search:        z.string().trim().optional(),
  currency:      z.string().optional(),                                  // ARS | USD
  saleCondition: z.enum(['CONTADO', 'CUENTA_CORRIENTE']).optional(),
  type:          z.string().optional(),                                  // FACTURA_A, NOTA_CREDITO_A, …
  dateFrom:      z.string().optional(),
  dateTo:        z.string().optional(),
});

const retencionesQuerySchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().positive().default(20),
  supplierId: z.string().uuid().optional(),
  type:       z.string().optional(),          // IIBB | GANANCIAS | IVA | SUSS | OTHER
  search:     z.string().trim().optional(),   // Nº de certificado, de factura o de OP
  dateFrom:   z.string().optional(),
  dateTo:     z.string().optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchFull(invoiceId: string) {
  const [invoice] = await prisma.$queryRaw<any[]>`
    SELECT pi.id, pi."purchaseId", pi."supplierId", pi.number, pi.type, pi.subtotal,
           pi."taxRate", pi."taxAmount", pi.amount, pi.currency, pi."exchangeRate",
           pi."saleCondition", pi.date, pi."dueDate", pi."imputationDate",
           pi."paymentMethod", pi.status, pi.notes, pi."companyId", pi."fiscalMode",
           pi."createdAt", pi."updatedAt", pi."originInvoiceId",
           s.name AS "supplierName", s.cuit AS "supplierCuit",
           p.number AS "purchaseNumber",
           orig.number AS "originNumber", orig.type AS "originType"
    FROM "purchase_invoices" pi
    LEFT JOIN "suppliers" s ON s.id = pi."supplierId"
    LEFT JOIN "purchases" p ON p.id = pi."purchaseId"
    LEFT JOIN "purchase_invoices" orig ON orig.id = pi."originInvoiceId"
    WHERE pi.id = ${invoiceId}
  `;
  if (!invoice) return null;

  const items = await prisma.$queryRaw<any[]>`
    SELECT id, description, quantity, "unitPrice", "taxRate", subtotal, "taxAmount", total
    FROM "purchase_invoice_items"
    WHERE "purchaseInvoiceId" = ${invoiceId}
    ORDER BY "createdAt" ASC
  `;

  const tributos = await prisma.$queryRaw<any[]>`
    SELECT id, type, jurisdiction, base, percentage, amount, description
    FROM "purchase_invoice_tributos"
    WHERE "purchaseInvoiceId" = ${invoiceId}
    ORDER BY "createdAt" ASC
  `;

  const remitos = await prisma.$queryRaw<any[]>`
    SELECT r.id, r.number, r.date, r.status
    FROM "purchase_invoice_remitos" pir
    JOIN "purchase_remitos" r ON r.id = pir."remitoId"
    WHERE pir."purchaseInvoiceId" = ${invoiceId}
    ORDER BY r."createdAt" ASC
  `;

  return {
    ...invoice,
    supplier: invoice.supplierName
      ? { id: invoice.supplierId, name: invoice.supplierName, cuit: invoice.supplierCuit ?? null }
      : undefined,
    purchase: invoice.purchaseId ? { id: invoice.purchaseId, number: invoice.purchaseNumber } : null,
    originInvoice: invoice.originInvoiceId
      ? { id: invoice.originInvoiceId, number: invoice.originNumber, type: invoice.originType }
      : null,
    items, tributos, remitos,
  };
}

async function upsertItems(invoiceId: string, items: z.infer<typeof itemSchema>[]) {
  await prisma.$executeRaw`DELETE FROM "purchase_invoice_items" WHERE "purchaseInvoiceId" = ${invoiceId}`;
  for (const item of items) {
    const id       = randomUUID();
    const subtotal = item.quantity * item.unitPrice;
    const taxAmount = subtotal * (item.taxRate / 100);
    const total     = subtotal + taxAmount;
    await prisma.$executeRaw`
      INSERT INTO "purchase_invoice_items"
        (id, "purchaseInvoiceId", description, quantity, "unitPrice", "taxRate", subtotal, "taxAmount", total)
      VALUES
        (${id}, ${invoiceId}, ${item.description}, ${item.quantity}, ${item.unitPrice},
         ${item.taxRate}, ${subtotal}, ${taxAmount}, ${total})
    `;
  }
}

async function upsertTributos(invoiceId: string, tributos: z.infer<typeof tribSchema>[]) {
  await prisma.$executeRaw`DELETE FROM "purchase_invoice_tributos" WHERE "purchaseInvoiceId" = ${invoiceId}`;
  for (const trib of tributos) {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "purchase_invoice_tributos"
        (id, "purchaseInvoiceId", type, jurisdiction, base, percentage, amount, description)
      VALUES
        (${id}, ${invoiceId}, ${trib.type}, ${trib.jurisdiction ?? null}, ${trib.base},
         ${trib.percentage}, ${trib.amount}, ${trib.description ?? null})
    `;
  }
}

// Valida que los remitos vinculados no reciban, por descripción, más cantidad
// que la que tiene la factura (evita ingresar más mercadería de la facturada).
// El companyId de la factura no alcanza: las FKs que llegan por el body apuntan
// a filas que pueden ser de otro tenant. Cada referencia se valida contra la
// empresa del token ANTES de escribirla, tanto al crear como al editar.
async function assertSupplierInCompany(supplierId: string, companyId?: string) {
  const [row] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "suppliers" WHERE id = ${supplierId} AND "companyId" = ${companyId}
  `;
  if (!row) throw new NotFoundError('Proveedor');
}

async function assertOriginInvoiceInCompany(originInvoiceId: string, companyId?: string) {
  const [row] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "purchase_invoices" WHERE id = ${originInvoiceId} AND "companyId" = ${companyId}
  `;
  if (!row) throw new NotFoundError('Factura de origen');
}

async function assertRemitosInCompany(remitoIds: string[], companyId?: string) {
  if (remitoIds.length === 0) return;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "purchase_remitos"
    WHERE id IN (${Prisma.join(remitoIds)}) AND "companyId" = ${companyId}
  `;
  if (rows.length !== remitoIds.length) throw new NotFoundError('Remito de compra');
}

async function assertRemitosWithinInvoice(invoiceId: string, remitoIds: string[]) {
  if (remitoIds.length === 0) return;

  const invItems = await prisma.$queryRaw<{ description: string; quantity: number }[]>`
    SELECT description, quantity FROM "purchase_invoice_items" WHERE "purchaseInvoiceId" = ${invoiceId}
  `;
  // Factura sin detalle de ítems → no hay contra qué validar cantidades.
  if (invItems.length === 0) return;

  const norm = (d: string) => d.trim().toLowerCase();
  const invByDesc = new Map<string, number>();
  for (const it of invItems) {
    const key = norm(it.description);
    invByDesc.set(key, (invByDesc.get(key) ?? 0) + Number(it.quantity));
  }

  const remitoItems = await prisma.$queryRaw<{ description: string; quantity: number }[]>`
    SELECT ri.description, ri.quantity
    FROM "purchase_remito_items" ri
    JOIN "purchase_remitos" r ON r.id = ri."remitoId"
    WHERE ri."remitoId" IN (${Prisma.join(remitoIds)})
      AND r.status <> 'CANCELLED'
  `;
  const recByDesc = new Map<string, number>();
  for (const it of remitoItems) {
    const key = norm(it.description);
    recByDesc.set(key, (recByDesc.get(key) ?? 0) + Number(it.quantity));
  }

  for (const [key, qty] of recByDesc) {
    const max = invByDesc.get(key);
    if (max === undefined) {
      throw new AppError('Los remitos incluyen mercadería que no pertenece a la factura', 400);
    }
    if (qty > max + 0.0001) {
      throw new AppError(
        `Se intenta recibir ${qty} unidades de un ítem, pero la factura solo tiene ${max}`,
        400,
      );
    }
  }
}

// Vincula la factura a remitos de compra (solo trazabilidad; el stock ya lo movió
// el remito). Marca los remitos como INVOICED. Idempotente: limpia los previos.
async function linkRemitos(invoiceId: string, remitoIds: string[], companyId?: string) {
  // Antes de nada: los remitos tienen que ser de la misma empresa. linkRemitos
  // no solo lee — marca los remitos como INVOICED, así que sin este chequeo era
  // una escritura cruzada entre tenants.
  await assertRemitosInCompany(remitoIds, companyId);
  await assertRemitosWithinInvoice(invoiceId, remitoIds);
  await prisma.$executeRaw`DELETE FROM "purchase_invoice_remitos" WHERE "purchaseInvoiceId" = ${invoiceId}`;
  for (const remitoId of remitoIds) {
    await prisma.$executeRaw`
      INSERT INTO "purchase_invoice_remitos" ("purchaseInvoiceId", "remitoId")
      VALUES (${invoiceId}, ${remitoId})
      ON CONFLICT DO NOTHING
    `;
    await prisma.$executeRaw`
      UPDATE "purchase_remitos" SET status = 'INVOICED', "updatedAt" = NOW()
      WHERE id = ${remitoId} AND status = 'RECEIVED'
    `;
  }
}

// ── Controller ───────────────────────────────────────────────────────────────

export class PurchaseInvoiceController {

  // ── Standalone (documento de primer nivel) ─────────────────────────────────

  async findAllStandalone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = querySchema.parse(req.query);
      const offset = (q.page - 1) * q.limit;

      const conditions: Prisma.Sql[] = [Prisma.sql`pi."companyId" = ${req.companyId}`];
      if (q.supplierId)    conditions.push(Prisma.sql`pi."supplierId" = ${q.supplierId}`);
      if (q.status)        conditions.push(Prisma.sql`pi.status = ${q.status}`);
      if (req.fiscalMode)  conditions.push(Prisma.sql`pi."fiscalMode" = ${req.fiscalMode}`);
      if (q.currency)      conditions.push(Prisma.sql`pi.currency = ${q.currency}`);
      if (q.saleCondition) conditions.push(Prisma.sql`pi."saleCondition" = ${q.saleCondition}`);
      if (q.type)          conditions.push(Prisma.sql`pi.type = ${q.type}`);
      if (q.search)        conditions.push(Prisma.sql`pi.number ILIKE ${'%' + q.search + '%'}`);
      if (q.dateFrom)      conditions.push(Prisma.sql`pi.date >= ${new Date(q.dateFrom)}`);
      if (q.dateTo) {
        const to = new Date(q.dateTo);
        to.setHours(23, 59, 59, 999);
        conditions.push(Prisma.sql`pi.date <= ${to}`);
      }
      const where = Prisma.join(conditions, ' AND ');

      // Lo ya imputado por órdenes de pago pagadas, en la moneda de la factura.
      const paidExpr = Prisma.sql`
        COALESCE((
          SELECT SUM(
            CASE WHEN op.currency = pi.currency THEN opi.amount ELSE opi.amount / NULLIF(op."exchangeRate", 0) END
          )
          FROM "orden_pago_items" opi
          JOIN "orden_pagos" op ON op.id = opi."ordenPagoId"
          WHERE opi."purchaseInvoiceId" = pi.id AND op.status = 'PAID'
        ), 0)`;

      // Los totales de la consulta se expresan en ARS: las facturas en moneda
      // extranjera se convierten con SU cotización (el valor al emitir), que es
      // el criterio con el que se generó el movimiento de cuenta corriente.
      const toArs = Prisma.sql`COALESCE(NULLIF(pi."exchangeRate", 0), 1)`;

      // Una Nota de Crédito NO es deuda: resta. Es el mismo criterio con el que
      // syncPurchaseInvoiceMovements la registra como CREDIT en la cuenta
      // corriente del proveedor. Sumarla en positivo inflaba el total y el saldo.
      const isNC = Prisma.sql`pi.type LIKE 'NOTA_CREDITO%'`;
      const signo = Prisma.sql`CASE WHEN ${isNC} THEN -1 ELSE 1 END`;

      const [countRows, rows, summaryRows] = await Promise.all([
        prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c FROM "purchase_invoices" pi WHERE ${where}`,
        prisma.$queryRaw<any[]>`
          SELECT pi.id, pi."supplierId", pi.number, pi.type, pi.subtotal, pi."taxAmount", pi.amount, pi.currency,
                 pi."exchangeRate", pi."saleCondition", pi.date, pi."dueDate", pi.status, pi."paymentMethod",
                 s.name AS "supplierName",
                 COALESCE((
                   SELECT SUM(t.amount) FROM "purchase_invoice_tributos" t
                   WHERE t."purchaseInvoiceId" = pi.id
                 ), 0) AS "tributosAmount",
                 ${paidExpr} AS "paidAmount"
          FROM "purchase_invoices" pi
          LEFT JOIN "suppliers" s ON s.id = pi."supplierId"
          WHERE ${where}
          ORDER BY pi.date DESC, pi."createdAt" DESC
          LIMIT ${q.limit} OFFSET ${offset}
        `,
        // Totales sobre TODO el filtro (no solo la página): lo que se está mirando.
        prisma.$queryRaw<any[]>`
          WITH base AS (
            SELECT pi.id, pi.status, pi."supplierId",
                   -- Una NC no vence: no tiene un saldo exigible que se atrase,
                   -- así que queda fuera de vencido y de "por vencer".
                   CASE WHEN ${isNC} THEN NULL ELSE pi."dueDate" END AS "dueDate",
                   pi.amount * ${toArs} * ${signo}    AS "totalArs",
                   ${paidExpr} * ${toArs} * ${signo}  AS "paidArs"
            FROM "purchase_invoices" pi
            WHERE ${where}
          )
          SELECT
            COUNT(*)::int                                     AS "count",
            COUNT(DISTINCT "supplierId")::int                 AS "supplierCount",
            COALESCE(SUM("totalArs"), 0)                      AS "totalArs",
            COALESCE(SUM("paidArs"), 0)                       AS "paidArs",
            COALESCE(SUM(CASE WHEN status <> 'PAID' THEN "totalArs" - "paidArs" ELSE 0 END), 0) AS "balanceArs",
            COALESCE(SUM(CASE WHEN status <> 'PAID' AND "dueDate" IS NOT NULL AND "dueDate" < CURRENT_DATE
                              THEN "totalArs" - "paidArs" ELSE 0 END), 0)                       AS "overdueArs",
            COUNT(*) FILTER (WHERE status <> 'PAID' AND "dueDate" IS NOT NULL AND "dueDate" < CURRENT_DATE)::int
                                                              AS "overdueCount",
            COALESCE(SUM(CASE WHEN status <> 'PAID' AND "dueDate" >= CURRENT_DATE
                                                   AND "dueDate" < CURRENT_DATE + INTERVAL '7 days'
                              THEN "totalArs" - "paidArs" ELSE 0 END), 0)                       AS "dueSoonArs",
            COUNT(*) FILTER (WHERE status <> 'PAID' AND "dueDate" >= CURRENT_DATE
                                                    AND "dueDate" < CURRENT_DATE + INTERVAL '7 days')::int
                                                              AS "dueSoonCount",
            MIN("dueDate") FILTER (WHERE status <> 'PAID' AND "dueDate" IS NOT NULL AND "dueDate" < CURRENT_DATE)
                                                              AS "oldestOverdueDate"
          FROM base
        `,
      ]);

      const total = Number(countRows[0]?.c ?? 0);
      const data = rows.map((r) => ({
        ...r,
        supplier: r.supplierName ? { id: r.supplierId, name: r.supplierName } : undefined,
      }));

      const s = summaryRows[0] ?? {};
      const summary = {
        count:             Number(s.count ?? 0),
        supplierCount:     Number(s.supplierCount ?? 0),
        totalArs:          Number(s.totalArs ?? 0),
        paidArs:           Number(s.paidArs ?? 0),
        balanceArs:        Number(s.balanceArs ?? 0),
        overdueArs:        Number(s.overdueArs ?? 0),
        overdueCount:      Number(s.overdueCount ?? 0),
        dueSoonArs:        Number(s.dueSoonArs ?? 0),
        dueSoonCount:      Number(s.dueSoonCount ?? 0),
        oldestOverdueDate: s.oldestOverdueDate ?? null,
      };

      res.json({ status: 'success', data, summary, total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) });
    } catch (error) { next(error); }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await fetchFull(req.params.id);
      if (!invoice || invoice.companyId !== req.companyId) throw new NotFoundError('Factura de proveedor');
      res.json({ status: 'success', data: invoice });
    } catch (error) { next(error); }
  }

  async createStandalone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = standaloneSchema.parse(req.body);

      await assertSupplierInCompany(data.supplierId, req.companyId);
      if (data.originInvoiceId) await assertOriginInvoiceInCompany(data.originInvoiceId, req.companyId);

      const id             = randomUUID();
      const date           = data.date           ? new Date(data.date)           : new Date();
      const dueDate        = data.dueDate        ? new Date(data.dueDate)        : null;
      const imputationDate = data.imputationDate ? new Date(data.imputationDate) : null;
      const fiscalMode     = req.fiscalMode ?? 'FORMAL';

      await prisma.$executeRaw`
        INSERT INTO "purchase_invoices"
          (id, "purchaseId", "supplierId", number, type, subtotal, "taxRate", "taxAmount",
           amount, currency, "exchangeRate", "saleCondition", date, "dueDate", "imputationDate",
           "paymentMethod", status, notes, "companyId", "updatedAt", "fiscalMode", "originInvoiceId")
        VALUES
          (${id}, ${null}, ${data.supplierId}, ${data.number}, ${data.type},
           ${data.subtotal}, ${data.taxRate}, ${data.taxAmount}, ${data.amount},
           ${data.currency}, ${data.exchangeRate}, ${data.saleCondition}, ${date}, ${dueDate}, ${imputationDate},
           ${data.paymentMethod}, 'PENDING', ${data.notes ?? null}, ${req.companyId}, NOW(), ${fiscalMode}, ${data.originInvoiceId ?? null})
      `;

      if (data.items?.length)     await upsertItems(id, data.items);
      if (data.tributos?.length)  await upsertTributos(id, data.tributos);
      if (data.remitoIds?.length) await linkRemitos(id, data.remitoIds, req.companyId);

      // Generate the supplier current-account movement for the invoice debt
      await container.resolve<IOrdenPagoRepository>('OrdenPagoRepository').syncPurchaseInvoiceMovements(id);

      const row = await fetchFull(id);
      res.status(201).json({ status: 'success', data: row });
    } catch (error) { next(error); }
  }

  async updateStandalone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [existing] = await prisma.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM "purchase_invoices" WHERE id = ${req.params.id} AND "companyId" = ${req.companyId}
      `;
      if (!existing) throw new NotFoundError('Factura de proveedor');

      const data = updateSchema.parse(req.body);
      const id = req.params.id;

      if (data.supplierId)      await assertSupplierInCompany(data.supplierId, req.companyId);
      if (data.originInvoiceId) await assertOriginInvoiceInCompany(data.originInvoiceId, req.companyId);

      // Una factura con pagos imputados no se edita, PERO sí se le puede vincular
      // mercadería (remitoIds) — recepción posterior a un pago anticipado.
      const onlyRemitoLink = Object.keys(data).every((k) => k === 'remitoIds' || data[k as keyof typeof data] === undefined);
      if ((existing.status === 'PAID' || existing.status === 'PARTIALLY_PAID') && !onlyRemitoLink) {
        throw new AppError('No se puede editar una factura con pagos imputados', 400);
      }

      if (data.supplierId    !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET "supplierId"    = ${data.supplierId},    "updatedAt" = NOW() WHERE id = ${id}`;
      if (data.number        !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET number          = ${data.number},        "updatedAt" = NOW() WHERE id = ${id}`;
      if (data.type          !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET type            = ${data.type},          "updatedAt" = NOW() WHERE id = ${id}`;
      if (data.subtotal      !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET subtotal        = ${data.subtotal},      "updatedAt" = NOW() WHERE id = ${id}`;
      if (data.taxRate       !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET "taxRate"       = ${data.taxRate},       "updatedAt" = NOW() WHERE id = ${id}`;
      if (data.taxAmount     !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET "taxAmount"     = ${data.taxAmount},     "updatedAt" = NOW() WHERE id = ${id}`;
      if (data.amount        !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET amount          = ${data.amount},        "updatedAt" = NOW() WHERE id = ${id}`;
      if (data.currency      !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET currency        = ${data.currency},      "updatedAt" = NOW() WHERE id = ${id}`;
      if (data.exchangeRate  !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET "exchangeRate"  = ${data.exchangeRate},  "updatedAt" = NOW() WHERE id = ${id}`;
      if (data.saleCondition !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET "saleCondition" = ${data.saleCondition}, "updatedAt" = NOW() WHERE id = ${id}`;
      if (data.paymentMethod !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET "paymentMethod" = ${data.paymentMethod}, "updatedAt" = NOW() WHERE id = ${id}`;
      if (data.status        !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET status          = ${data.status},        "updatedAt" = NOW() WHERE id = ${id}`;
      if (data.notes         !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET notes           = ${data.notes ?? null}, "updatedAt" = NOW() WHERE id = ${id}`;
      if (data.originInvoiceId !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET "originInvoiceId" = ${data.originInvoiceId ?? null}, "updatedAt" = NOW() WHERE id = ${id}`;
      if (data.date !== undefined) {
        const d = data.date ? new Date(data.date) : new Date();
        await prisma.$executeRaw`UPDATE "purchase_invoices" SET date = ${d}, "updatedAt" = NOW() WHERE id = ${id}`;
      }
      if (data.dueDate !== undefined) {
        const d = data.dueDate ? new Date(data.dueDate) : null;
        await prisma.$executeRaw`UPDATE "purchase_invoices" SET "dueDate" = ${d}, "updatedAt" = NOW() WHERE id = ${id}`;
      }
      if (data.imputationDate !== undefined) {
        const d = data.imputationDate ? new Date(data.imputationDate) : null;
        await prisma.$executeRaw`UPDATE "purchase_invoices" SET "imputationDate" = ${d}, "updatedAt" = NOW() WHERE id = ${id}`;
      }
      if (data.items     !== undefined) await upsertItems(id, data.items);
      if (data.tributos  !== undefined) await upsertTributos(id, data.tributos);
      if (data.remitoIds !== undefined) await linkRemitos(id, data.remitoIds, req.companyId);

      // Re-sync supplier current account (invoice debt)
      await container.resolve<IOrdenPagoRepository>('OrdenPagoRepository').syncPurchaseInvoiceMovements(id);

      const row = await fetchFull(id);
      res.json({ status: 'success', data: row });
    } catch (error) { next(error); }
  }

  async deleteStandalone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [existing] = await prisma.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM "purchase_invoices" WHERE id = ${req.params.id} AND "companyId" = ${req.companyId}
      `;
      if (!existing) throw new NotFoundError('Factura de proveedor');
      if (existing.status === 'PAID' || existing.status === 'PARTIALLY_PAID') {
        throw new AppError('No se puede eliminar una factura con pagos imputados', 400);
      }

      // CASCADE removes items/tributos/account-movements/remito links
      await prisma.$executeRaw`DELETE FROM "purchase_invoices" WHERE id = ${req.params.id}`;
      res.status(204).send();
    } catch (error) { next(error); }
  }

  // ── Nested under a purchase (legacy: /api/purchases/:purchaseId/invoices) ────

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT id FROM "purchase_invoices"
        WHERE "purchaseId" = ${req.params.purchaseId}
        ORDER BY "createdAt" ASC
      `;
      const full = await Promise.all(rows.map((r) => fetchFull(r.id)));
      res.json({ status: 'success', data: full.filter(Boolean) });
    } catch (error) { next(error); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Inherit supplier/currency/saleCondition from the parent purchase so the
      // invoice (now the source of truth for the debt) carries them itself.
      const [purchase] = await prisma.$queryRaw<any[]>`
        SELECT id, "supplierId", currency::text AS currency, "saleCondition", "exchangeRate"
        FROM "purchases" WHERE id = ${req.params.purchaseId} AND "companyId" = ${req.companyId}
      `;
      if (!purchase) throw new NotFoundError('Compra');

      const data           = baseInvoiceSchema.parse(req.body);
      const id             = randomUUID();
      const dueDate        = data.dueDate        ? new Date(data.dueDate)        : null;
      const imputationDate = data.imputationDate ? new Date(data.imputationDate) : null;
      const fiscalMode     = req.fiscalMode ?? 'FORMAL';

      await prisma.$executeRaw`
        INSERT INTO "purchase_invoices"
          (id, "purchaseId", "supplierId", number, type, subtotal, "taxRate", "taxAmount",
           amount, currency, "exchangeRate", "saleCondition", "dueDate", "imputationDate",
           "paymentMethod", status, notes, "companyId", "updatedAt", "fiscalMode")
        VALUES
          (${id}, ${req.params.purchaseId}, ${purchase.supplierId}, ${data.number}, ${data.type},
           ${data.subtotal}, ${data.taxRate}, ${data.taxAmount}, ${data.amount},
           ${purchase.currency}, ${Number(purchase.exchangeRate) || 1}, ${purchase.saleCondition},
           ${dueDate}, ${imputationDate}, ${data.paymentMethod},
           'PENDING', ${data.notes ?? null}, ${req.companyId}, NOW(), ${fiscalMode})
      `;

      if (data.items?.length)    await upsertItems(id, data.items);
      if (data.tributos?.length) await upsertTributos(id, data.tributos);

      await container.resolve<IOrdenPagoRepository>('OrdenPagoRepository').syncPurchaseInvoiceMovements(id);

      const row = await fetchFull(id);
      res.status(201).json({ status: 'success', data: row });
    } catch (error) { next(error); }
  }

  // Arrow fields: bound `this` so the nested routes can delegate to the standalone
  // handlers even though Express calls them unbound.
  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    req.params.id = req.params.invoiceId;
    return this.updateStandalone(req, res, next);
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    req.params.id = req.params.invoiceId;
    return this.deleteStandalone(req, res, next);
  };

  // ── Consulta de retenciones practicadas (para reimprimir el comprobante) ───
  async findRetenciones(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = retencionesQuerySchema.parse(req.query);
      const offset = (q.page - 1) * q.limit;

      // Las retenciones se practican únicamente al pagar (orden_pago_retenciones),
      // que es el momento en que corresponden legalmente.
      // `base` sale como IMPORTE y `baseKind` (NETO/IVA/BRUTO) indica sobre qué
      // se calculó.
      const opConditions: Prisma.Sql[] = [Prisma.sql`op."companyId" = ${req.companyId}`];
      if (q.supplierId) opConditions.push(Prisma.sql`op."supplierId" = ${q.supplierId}`);
      if (q.type)       opConditions.push(Prisma.sql`ret.type = ${q.type}`);
      if (q.dateFrom)   opConditions.push(Prisma.sql`op.date >= ${new Date(q.dateFrom)}`);
      if (q.dateTo) {
        const to = new Date(q.dateTo);
        to.setHours(23, 59, 59, 999);
        opConditions.push(Prisma.sql`op.date <= ${to}`);
      }
      if (q.search) {
        const term = `%${q.search}%`;
        opConditions.push(Prisma.sql`(ret.certificate ILIKE ${term} OR op.number ILIKE ${term})`);
      }

      // Las OP canceladas no practicaron retención.
      opConditions.push(Prisma.sql`op.status <> 'CANCELLED'`);

      const unioned = Prisma.sql`
        SELECT ret.id, 'ORDEN_PAGO' AS origin, ret.type, ret.jurisdiction,
               ret."baseAmount", ret.base AS "baseKind",
               ret.percentage, ret.amount, ret.certificate, ret.notes, ret."createdAt",
               op.id AS "docId", op.number AS "docNumber", op.date AS "docDate", op.currency,
               s.id AS "supplierId", s.name AS "supplierName", s.cuit AS "supplierCuit"
        FROM "orden_pago_retenciones" ret
        JOIN "orden_pagos" op ON op.id = ret."ordenPagoId"
        JOIN "suppliers" s ON s.id = op."supplierId"
        WHERE ${Prisma.join(opConditions, ' AND ')}
      `;

      const [countRows, rows] = await Promise.all([
        prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c FROM (${unioned}) u`,
        prisma.$queryRaw<any[]>`
          SELECT * FROM (${unioned}) u
          ORDER BY u."createdAt" DESC
          LIMIT ${q.limit} OFFSET ${offset}
        `,
      ]);

      const total = Number(countRows[0]?.c ?? 0);
      const data = rows.map((r) => ({
        ...r,
        base: r.baseAmount,
        // `invoice` conserva el nombre por compatibilidad (certificado PDF y
        // listado): apunta a la orden de pago que originó la retención.
        invoice: { id: r.docId, number: r.docNumber, date: r.docDate, currency: r.currency },
        supplier: { id: r.supplierId, name: r.supplierName, cuit: r.supplierCuit ?? null },
      }));

      res.json({ status: 'success', data, total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) });
    } catch (error) { next(error); }
  }
}
