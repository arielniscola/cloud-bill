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

const retSchema = z.object({
  type:         z.string().default('IIBB'),   // IIBB | GANANCIAS | IVA | OTHER
  jurisdiction: z.string().optional().nullable(),
  base:         z.coerce.number().min(0),
  percentage:   z.coerce.number().min(0).max(100),
  amount:       z.coerce.number().min(0),
  certificate:  z.string().optional().nullable(),
  notes:        z.string().optional().nullable(),
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
  retenciones:    z.array(retSchema).optional().default([]),
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
  status: z.enum(['PENDING', 'PAID']).optional(),
});

const querySchema = z.object({
  page:          z.coerce.number().int().positive().default(1),
  limit:         z.coerce.number().int().positive().default(20),
  supplierId:    z.string().uuid().optional(),
  status:        z.enum(['PENDING', 'PAID']).optional(),
  search:        z.string().trim().optional(),
  currency:      z.string().optional(),                                  // ARS | USD
  saleCondition: z.enum(['CONTADO', 'CUENTA_CORRIENTE']).optional(),
  type:          z.string().optional(),                                  // FACTURA_A, NOTA_CREDITO_A, …
  dateFrom:      z.string().optional(),
  dateTo:        z.string().optional(),
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

  const retenciones = await prisma.$queryRaw<any[]>`
    SELECT id, type, jurisdiction, base, percentage, amount, certificate, notes
    FROM "purchase_invoice_retenciones"
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
    items, retenciones, tributos, remitos,
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

async function upsertRetenciones(invoiceId: string, retenciones: z.infer<typeof retSchema>[]) {
  await prisma.$executeRaw`DELETE FROM "purchase_invoice_retenciones" WHERE "purchaseInvoiceId" = ${invoiceId}`;
  for (const ret of retenciones) {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "purchase_invoice_retenciones"
        (id, "purchaseInvoiceId", type, jurisdiction, base, percentage, amount, certificate, notes)
      VALUES
        (${id}, ${invoiceId}, ${ret.type}, ${ret.jurisdiction ?? null}, ${ret.base},
         ${ret.percentage}, ${ret.amount}, ${ret.certificate ?? null}, ${ret.notes ?? null})
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

// Vincula la factura a remitos de compra (solo trazabilidad; el stock ya lo movió
// el remito). Marca los remitos como INVOICED. Idempotente: limpia los previos.
async function linkRemitos(invoiceId: string, remitoIds: string[]) {
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

      const [countRows, rows] = await Promise.all([
        prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c FROM "purchase_invoices" pi WHERE ${where}`,
        prisma.$queryRaw<any[]>`
          SELECT pi.id, pi."supplierId", pi.number, pi.type, pi.amount, pi.currency,
                 pi."exchangeRate", pi."saleCondition", pi.date, pi."dueDate", pi.status, pi."paymentMethod",
                 s.name AS "supplierName",
                 COALESCE((
                   SELECT SUM(opi.amount)
                   FROM "orden_pago_items" opi
                   JOIN "orden_pagos" op ON op.id = opi."ordenPagoId"
                   WHERE opi."purchaseInvoiceId" = pi.id AND op.status = 'PAID'
                 ), 0) AS "paidAmount"
          FROM "purchase_invoices" pi
          LEFT JOIN "suppliers" s ON s.id = pi."supplierId"
          WHERE ${where}
          ORDER BY pi.date DESC, pi."createdAt" DESC
          LIMIT ${q.limit} OFFSET ${offset}
        `,
      ]);

      const total = Number(countRows[0]?.c ?? 0);
      const data = rows.map((r) => ({
        ...r,
        supplier: r.supplierName ? { id: r.supplierId, name: r.supplierName } : undefined,
      }));

      res.json({ status: 'success', data, total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) });
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

      // Validate supplier belongs to the company
      const [supplier] = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "suppliers" WHERE id = ${data.supplierId} AND "companyId" = ${req.companyId}
      `;
      if (!supplier) throw new NotFoundError('Proveedor');

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

      if (data.items?.length)       await upsertItems(id, data.items);
      if (data.retenciones?.length) await upsertRetenciones(id, data.retenciones);
      if (data.tributos?.length)    await upsertTributos(id, data.tributos);
      if (data.remitoIds?.length)   await linkRemitos(id, data.remitoIds);

      // Generate supplier current-account movements (main debt + retenciones)
      await container.resolve<IOrdenPagoRepository>('OrdenPagoRepository').syncPurchaseInvoiceMovements(id);

      const row = await fetchFull(id);
      res.status(201).json({ status: 'success', data: row });
    } catch (error) { next(error); }
  }

  async updateStandalone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [existing] = await prisma.$queryRaw<any[]>`
        SELECT id FROM "purchase_invoices" WHERE id = ${req.params.id} AND "companyId" = ${req.companyId}
      `;
      if (!existing) throw new NotFoundError('Factura de proveedor');

      const data = updateSchema.parse(req.body);
      const id = req.params.id;

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
      if (data.items       !== undefined) await upsertItems(id, data.items);
      if (data.retenciones !== undefined) await upsertRetenciones(id, data.retenciones);
      if (data.tributos    !== undefined) await upsertTributos(id, data.tributos);
      if (data.remitoIds   !== undefined) await linkRemitos(id, data.remitoIds);

      // Re-sync supplier current account (main debt + retenciones)
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
      if (existing.status === 'PAID') throw new AppError('No se puede eliminar una factura pagada', 400);

      // CASCADE removes items/retenciones/tributos/account-movements/remito links
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

      if (data.items?.length)       await upsertItems(id, data.items);
      if (data.retenciones?.length) await upsertRetenciones(id, data.retenciones);
      if (data.tributos?.length)    await upsertTributos(id, data.tributos);

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
}
