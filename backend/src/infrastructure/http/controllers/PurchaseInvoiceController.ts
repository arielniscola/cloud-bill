import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import prisma from '../../database/prisma';
import { NotFoundError } from '../../../shared/errors/AppError';

const invoiceSchema = z.object({
  number:        z.string().min(1, 'El número es requerido'),
  type:          z.string().default('FACTURA_A'),
  subtotal:      z.coerce.number().min(0).default(0),
  taxRate:       z.coerce.number().min(0).max(100).default(21),
  taxAmount:     z.coerce.number().min(0).default(0),
  amount:        z.coerce.number().positive('El total debe ser positivo'),
  dueDate:       z.string().optional().nullable(),
  paymentMethod: z.string().default('BANK_TRANSFER'),
  notes:         z.string().optional().nullable(),
});

const updateSchema = invoiceSchema.partial().extend({
  status: z.enum(['PENDING', 'PAID']).optional(),
});

export class PurchaseInvoiceController {

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT id, "purchaseId", number, type, subtotal, "taxRate", "taxAmount",
               amount, "dueDate", "paymentMethod", status, notes, "createdAt", "updatedAt"
        FROM "purchase_invoices"
        WHERE "purchaseId" = ${req.params.purchaseId}
        ORDER BY "createdAt" ASC
      `;
      res.json({ status: 'success', data: rows });
    } catch (error) { next(error); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const purchases = await prisma.$queryRaw<any[]>`
        SELECT id FROM "purchases"
        WHERE id = ${req.params.purchaseId} AND "companyId" = ${req.companyId}
      `;
      if (!purchases.length) throw new NotFoundError('Compra');

      const data    = invoiceSchema.parse(req.body);
      const id      = randomUUID();
      const dueDate = data.dueDate ? new Date(data.dueDate) : null;

      await prisma.$executeRaw`
        INSERT INTO "purchase_invoices"
          (id, "purchaseId", number, type, subtotal, "taxRate", "taxAmount",
           amount, "dueDate", "paymentMethod", status, notes, "companyId")
        VALUES
          (${id}, ${req.params.purchaseId}, ${data.number}, ${data.type},
           ${data.subtotal}, ${data.taxRate}, ${data.taxAmount},
           ${data.amount}, ${dueDate}, ${data.paymentMethod},
           'PENDING', ${data.notes ?? null}, ${req.companyId})
      `;

      const [row] = await prisma.$queryRaw<any[]>`
        SELECT id, "purchaseId", number, type, subtotal, "taxRate", "taxAmount",
               amount, "dueDate", "paymentMethod", status, notes, "createdAt"
        FROM "purchase_invoices" WHERE id = ${id}
      `;
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

      if (data.number        !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET number         = ${data.number},                 "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.type          !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET type           = ${data.type},                   "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.subtotal      !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET subtotal       = ${data.subtotal},               "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.taxRate       !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET "taxRate"      = ${data.taxRate},                "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.taxAmount     !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET "taxAmount"    = ${data.taxAmount},              "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.amount        !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET amount         = ${data.amount},                 "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.paymentMethod !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET "paymentMethod"= ${data.paymentMethod},          "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.status        !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET status         = ${data.status},                 "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.notes         !== undefined) await prisma.$executeRaw`UPDATE "purchase_invoices" SET notes          = ${data.notes ?? null},          "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      if (data.dueDate !== undefined) {
        const dueDate = data.dueDate ? new Date(data.dueDate) : null;
        await prisma.$executeRaw`UPDATE "purchase_invoices" SET "dueDate" = ${dueDate}, "updatedAt" = NOW() WHERE id = ${req.params.invoiceId}`;
      }

      const [row] = await prisma.$queryRaw<any[]>`
        SELECT id, "purchaseId", number, type, subtotal, "taxRate", "taxAmount",
               amount, "dueDate", "paymentMethod", status, notes, "createdAt", "updatedAt"
        FROM "purchase_invoices" WHERE id = ${req.params.invoiceId}
      `;
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
