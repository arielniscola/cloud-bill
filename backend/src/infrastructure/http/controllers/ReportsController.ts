import { Request, Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../../database/prisma';

export class ReportsController {
  async salesByProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      const { dateFrom, dateTo, type, status, currency, customerId } = req.query as Record<string, string>;

      // Invoice filters
      const invoiceWhere: Record<string, unknown> = { companyId };

      if (status) {
        invoiceWhere.status = status;
      } else {
        invoiceWhere.status = { notIn: ['CANCELLED', 'DRAFT'] };
      }
      if (type)       invoiceWhere.type     = type;
      if (currency)   invoiceWhere.currency = currency;
      if (customerId) invoiceWhere.customerId = customerId;
      if (dateFrom || dateTo) {
        invoiceWhere.date = {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo   && { lte: new Date(dateTo)   }),
        };
      }

      const items = await prisma.invoiceItem.findMany({
        where: { invoice: invoiceWhere },
        include: {
          invoice: { select: { id: true, type: true } },
          product: { select: { id: true, name: true, sku: true } },
        },
      });

      // Aggregate per product
      const map = new Map<string, {
        productId: string;
        productName: string;
        productSku: string;
        invoiceIds: Set<string>;
        quantity: number;
        subtotal: number;
        taxAmount: number;
        total: number;
      }>();

      for (const item of items) {
        const isNC = (item.invoice.type as string).startsWith('NOTA_CREDITO');
        const sign = isNC ? -1 : 1;

        const qty = (item.quantity as Decimal).toNumber() * sign;
        const sub = (item.subtotal  as Decimal).toNumber() * sign;
        const tax = (item.taxAmount as Decimal).toNumber() * sign;
        const tot = (item.total     as Decimal).toNumber() * sign;

        const existing = map.get(item.productId);
        if (existing) {
          existing.invoiceIds.add(item.invoice.id);
          existing.quantity  += qty;
          existing.subtotal  += sub;
          existing.taxAmount += tax;
          existing.total     += tot;
        } else {
          map.set(item.productId, {
            productId:   item.productId,
            productName: item.product.name,
            productSku:  item.product.sku,
            invoiceIds:  new Set([item.invoice.id]),
            quantity:    qty,
            subtotal:    sub,
            taxAmount:   tax,
            total:       tot,
          });
        }
      }

      const data = Array.from(map.values())
        .map(({ invoiceIds, ...rest }) => ({
          ...rest,
          invoiceCount: invoiceIds.size,
          unitPriceAvg: rest.quantity !== 0
            ? Math.round((rest.subtotal / rest.quantity) * 100) / 100
            : 0,
          quantity:  Math.round(rest.quantity  * 100) / 100,
          subtotal:  Math.round(rest.subtotal  * 100) / 100,
          taxAmount: Math.round(rest.taxAmount * 100) / 100,
          total:     Math.round(rest.total     * 100) / 100,
        }))
        .sort((a, b) => b.total - a.total);

      res.json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }
}
