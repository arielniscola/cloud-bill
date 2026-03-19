import { Request, Response, NextFunction } from 'express';
import prisma from '../../database/prisma';

export class SearchController {
  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = ((req.query.q as string) ?? '').trim();
      if (!q || q.length < 2) {
        res.json({ status: 'success', data: { invoices: [], customers: [], products: [], budgets: [] } });
        return;
      }

      const companyId = req.companyId;
      const limit = 5;

      const [invoices, customers, products, budgets] = await Promise.all([
        prisma.invoice.findMany({
          where: {
            ...(companyId ? { companyId } : {}),
            status: { not: 'CANCELLED' },
            OR: [
              { number: { contains: q, mode: 'insensitive' } },
              { customer: { name: { contains: q, mode: 'insensitive' } } },
            ],
          },
          select: {
            id: true,
            number: true,
            type: true,
            status: true,
            total: true,
            date: true,
            customer: { select: { id: true, name: true } },
          },
          orderBy: { date: 'desc' },
          take: limit,
        }),

        prisma.customer.findMany({
          where: {
            ...(companyId ? { companyId } : {}),
            isActive: true,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { taxId: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, name: true, taxId: true, email: true },
          take: limit,
        }),

        prisma.product.findMany({
          where: {
            ...(companyId ? { companyId } : {}),
            isActive: true,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { sku: { contains: q, mode: 'insensitive' } },
              { barcode: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, name: true, sku: true, price: true },
          take: limit,
        }),

        prisma.budget.findMany({
          where: {
            ...(companyId ? { companyId } : {}),
            status: { not: 'REJECTED' },
            OR: [
              { number: { contains: q, mode: 'insensitive' } },
              { customer: { name: { contains: q, mode: 'insensitive' } } },
            ],
          },
          select: {
            id: true,
            number: true,
            status: true,
            total: true,
            date: true,
            customer: { select: { id: true, name: true } },
          },
          orderBy: { date: 'desc' },
          take: limit,
        }),
      ]);

      res.json({
        status: 'success',
        data: {
          invoices: invoices.map((i) => ({ ...i, total: Number(i.total) })),
          customers,
          products: products.map((p) => ({ ...p, price: Number(p.price) })),
          budgets: budgets.map((b) => ({ ...b, total: Number(b.total) })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
