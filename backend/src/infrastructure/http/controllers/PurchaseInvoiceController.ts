import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import prisma from '../../database/prisma';
import { NotFoundError } from '../../../shared/errors/AppError';

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

const invoiceSchema = z.object({
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
});

const updateSchema = invoiceSchema.partial().extend({
  status: z.enum(['PENDING', 'PAID']).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchFull(invoiceId: string) {
  const [invoice] = await prisma.$queryRaw<any[]>`
    SELECT id, "purchaseId", number, type, subtotal, "taxRate", "taxAmount",
           amount, "dueDate", "imputationDate", "paymentMethod", status, notes,
           "companyId", "createdAt", "updatedAt"
    FROM "purchase_invoices" WHERE id = ${invoiceId}
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

  return { ...invoice, items, retenciones };
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

// ── Controller ───────────────────────────────────────────────────────────────

export class PurchaseInvoiceController {

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT id, "purchaseId", number, type, subtotal, "taxRate", "taxAmount",
               amount, "dueDate", "imputationDate", "paymentMethod", status, notes, "createdAt", "updatedAt"
        FROM "purchase_invoices"
        WHERE "purchaseId" = ${req.params.purchaseId}
        ORDER BY "createdAt" ASC
      `;

      // Attach items + retenciones
      const full = await Promise.all(rows.map((r) => fetchFull(r.id)));
      res.json({ status: 'success', data: full.filter(Boolean) });
    } catch (error) { next(error); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const purchases = await prisma.$queryRaw<any[]>`
        SELECT id FROM "purchases"
        WHERE id = ${req.params.purchaseId} AND "companyId" = ${req.companyId}
      `;
      if (!purchases.length) throw new NotFoundError('Compra');

      const data           = invoiceSchema.parse(req.body);
      const id             = randomUUID();
      const dueDate        = data.dueDate        ? new Date(data.dueDate)        : null;
      const imputationDate = data.imputationDate ? new Date(data.imputationDate) : null;

      const fiscalMode = req.fiscalMode ?? 'FORMAL';
      await prisma.$executeRaw`
        INSERT INTO "purchase_invoices"
          (id, "purchaseId", number, type, subtotal, "taxRate", "taxAmount",
           amount, "dueDate", "imputationDate", "paymentMethod", status, notes, "companyId", "updatedAt", "fiscalMode")
        VALUES
          (${id}, ${req.params.purchaseId}, ${data.number}, ${data.type},
           ${data.subtotal}, ${data.taxRate}, ${data.taxAmount},
           ${data.amount}, ${dueDate}, ${imputationDate}, ${data.paymentMethod},
           'PENDING', ${data.notes ?? null}, ${req.companyId}, NOW(), ${fiscalMode})
      `;

      if (data.items?.length)      await upsertItems(id, data.items);
      if (data.retenciones?.length) await upsertRetenciones(id, data.retenciones);

      const row = await fetchFull(id);
      res.status(201).json({ status: 'success', data: row });
    } catch (error) { next(error); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [existing] = await prisma.$queryRaw<any[]>`
        SELECT pi.id FROM "purchase_invoices" pi
        JOIN "purchases" p ON p.id = pi."purchaseId"
        WHERE pi.id = ${req.params.invoiceId}
          AND pi."purchaseId" = ${req.params.purchaseId}
          AND p."companyId" = ${req.companyId}
      `;
      if (!existing) throw new NotFoundError('Factura de proveedor');

      const data = updateSchema.parse(req.body);

      if (data.number        !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET number          = ${data.number},                 "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.type          !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET type            = ${data.type},                   "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.subtotal      !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET subtotal        = ${data.subtotal},               "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.taxRate       !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET "taxRate"       = ${data.taxRate},                "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.taxAmount     !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET "taxAmount"     = ${data.taxAmount},              "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.amount        !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET amount          = ${data.amount},                 "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.paymentMethod !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET "paymentMethod" = ${data.paymentMethod},          "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.status        !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET status          = ${data.status},                 "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.notes         !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET notes           = ${data.notes ?? null},          "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.dueDate !== undefined) {
        const dueDate = data.dueDate ? new Date(data.dueDate) : null;
        await prisma.$executeRaw`UPDATE "purchase_invoices" SET "dueDate" = ${dueDate}, "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      }
      if (data.imputationDate !== undefined) {
        const imputationDate = data.imputationDate ? new Date(data.imputationDate) : null;
        await prisma.$executeRaw`UPDATE "purchase_invoices" SET "imputationDate" = ${imputationDate}, "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      }
      if (data.items      !== undefined) await upsertItems(req.params.invoiceId, data.items);
      if (data.retenciones !== undefined) await upsertRetenciones(req.params.invoiceId, data.retenciones);

      const row = await fetchFull(req.params.invoiceId);
      res.json({ status: 'success', data: row });
    } catch (error) { next(error); }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [existing] = await prisma.$queryRaw<any[]>`
        SELECT pi.id FROM "purchase_invoices" pi
        JOIN "purchases" p ON p.id = pi."purchaseId"
        WHERE pi.id = ${req.params.invoiceId}
          AND pi."purchaseId" = ${req.params.purchaseId}
          AND p."companyId" = ${req.companyId}
      `;
      if (!existing) throw new NotFoundError('Factura de proveedor');

      await prisma.$executeRaw`DELETE FROM "purchase_invoices" WHERE id = ${req.params.invoiceId}`;
      res.status(204).send();
    } catch (error) { next(error); }
  }
}
