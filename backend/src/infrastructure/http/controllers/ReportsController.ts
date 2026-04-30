import { Request, Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../../database/prisma';

const round2 = (n: number) => Math.round(n * 100) / 100;

export class ReportsController {

  // ── GET /reports/sales/by-product ────────────────────────────────
  async salesByProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      const { dateFrom, dateTo, type, status, currency, customerId } = req.query as Record<string, string>;

      const invoiceWhere: Record<string, unknown> = { companyId, ...(req.fiscalMode && { fiscalMode: req.fiscalMode }) };
      if (status) invoiceWhere.status = status;
      else invoiceWhere.status = { notIn: ['CANCELLED', 'DRAFT'] };
      if (type)       invoiceWhere.type      = type;
      if (currency)   invoiceWhere.currency  = currency;
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

      const map = new Map<string, {
        productId: string; productName: string; productSku: string;
        invoiceIds: Set<string>; quantity: number; subtotal: number;
        taxAmount: number; total: number;
      }>();

      for (const item of items) {
        const isNC = (item.invoice.type as string).startsWith('NOTA_CREDITO');
        const sign = isNC ? -1 : 1;
        const qty  = (item.quantity as Decimal).toNumber() * sign;
        const sub  = (item.subtotal  as Decimal).toNumber() * sign;
        const tax  = (item.taxAmount as Decimal).toNumber() * sign;
        const tot  = (item.total     as Decimal).toNumber() * sign;

        const ex = map.get(item.productId);
        if (ex) {
          ex.invoiceIds.add(item.invoice.id);
          ex.quantity += qty; ex.subtotal += sub;
          ex.taxAmount += tax; ex.total += tot;
        } else {
          map.set(item.productId, {
            productId: item.productId, productName: item.product.name,
            productSku: item.product.sku, invoiceIds: new Set([item.invoice.id]),
            quantity: qty, subtotal: sub, taxAmount: tax, total: tot,
          });
        }
      }

      const data = Array.from(map.values())
        .map(({ invoiceIds, ...rest }) => ({
          ...rest,
          invoiceCount: invoiceIds.size,
          unitPriceAvg: rest.quantity !== 0 ? round2(rest.subtotal / rest.quantity) : 0,
          quantity: round2(rest.quantity), subtotal: round2(rest.subtotal),
          taxAmount: round2(rest.taxAmount), total: round2(rest.total),
        }))
        .sort((a, b) => b.total - a.total);

      res.json({ status: 'success', data });
    } catch (error) { next(error); }
  }

  // ── GET /reports/purchases/by-supplier ───────────────────────────
  async purchasesBySupplier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      const { dateFrom, dateTo, supplierId, status } = req.query as Record<string, string>;

      const where: Record<string, unknown> = { companyId, ...(req.fiscalMode && { fiscalMode: req.fiscalMode }) };
      if (status) where.status = status;
      else where.status = { not: 'CANCELLED' };
      if (supplierId) where.supplierId = supplierId;
      if (dateFrom || dateTo) {
        where.date = {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo   && { lte: new Date(dateTo)   }),
        };
      }

      const purchases = await prisma.purchase.findMany({
        where,
        include: { supplier: { select: { id: true, name: true, cuit: true } } },
      });

      const map = new Map<string, {
        supplierId: string; supplierName: string; supplierCuit: string;
        purchaseCount: number; subtotal: number; taxAmount: number; total: number;
      }>();

      for (const p of purchases) {
        const ex = map.get(p.supplierId);
        if (ex) {
          ex.purchaseCount++;
          ex.subtotal  += (p.subtotal  as Decimal).toNumber();
          ex.taxAmount += (p.taxAmount as Decimal).toNumber();
          ex.total     += (p.total     as Decimal).toNumber();
        } else {
          map.set(p.supplierId, {
            supplierId:   p.supplierId,
            supplierName: p.supplier.name,
            supplierCuit: p.supplier.cuit ?? '—',
            purchaseCount: 1,
            subtotal:  (p.subtotal  as Decimal).toNumber(),
            taxAmount: (p.taxAmount as Decimal).toNumber(),
            total:     (p.total     as Decimal).toNumber(),
          });
        }
      }

      const data = Array.from(map.values())
        .map((e) => ({ ...e, subtotal: round2(e.subtotal), taxAmount: round2(e.taxAmount), total: round2(e.total) }))
        .sort((a, b) => b.total - a.total);

      res.json({ status: 'success', data });
    } catch (error) { next(error); }
  }

  // ── GET /reports/profitability ────────────────────────────────────
  async profitability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      const { categoryId, brandId } = req.query as Record<string, string>;

      const where: Record<string, unknown> = { companyId, isActive: true };
      if (categoryId) where.categoryId = categoryId;
      if (brandId)    where.brandId    = brandId;

      const products = await prisma.product.findMany({
        where,
        include: {
          category: { select: { name: true } },
          brand:    { select: { name: true } },
        },
      });

      const data = products
        .map((p) => {
          const cost     = (p.cost  as Decimal).toNumber();
          const price    = (p.price as Decimal).toNumber();
          const margin   = price - cost;
          const marginPct = price > 0 ? (margin / price) * 100 : 0;
          return {
            productId:  p.id,
            sku:        p.sku,
            name:       p.name,
            category:   (p as any).category?.name ?? '—',
            brand:      (p as any).brand?.name    ?? '—',
            cost:       round2(cost),
            price:      round2(price),
            margin:     round2(margin),
            marginPct:  Math.round(marginPct * 10) / 10,
          };
        })
        .sort((a, b) => b.marginPct - a.marginPct);

      res.json({ status: 'success', data });
    } catch (error) { next(error); }
  }

  // ── GET /reports/stock-valuation ─────────────────────────────────
  async stockValuation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      const { warehouseId, categoryId } = req.query as Record<string, string>;

      const stockWhere: Record<string, unknown> = {
        warehouse: { companyId },
        quantity:  { gt: 0 },
      };
      if (warehouseId) stockWhere.warehouseId = warehouseId;
      if (categoryId)  stockWhere.product = { categoryId };

      const stocks = await prisma.stock.findMany({
        where: stockWhere,
        include: {
          product:   { include: { category: { select: { name: true } } } },
          warehouse: { select: { name: true } },
        },
      });

      const data = stocks
        .map((s) => {
          const qty   = (s.quantity as Decimal).toNumber();
          const cost  = (s.product.cost as Decimal).toNumber();
          return {
            productId:   s.product.id,
            sku:         s.product.sku,
            name:        s.product.name,
            category:    (s.product as any).category?.name ?? '—',
            warehouse:   s.warehouse.name,
            quantity:    round2(qty),
            unitCost:    round2(cost),
            totalValue:  round2(qty * cost),
          };
        })
        .sort((a, b) => b.totalValue - a.totalValue);

      const totalCapital = round2(data.reduce((acc, r) => acc + r.totalValue, 0));
      res.json({ status: 'success', data, totalCapital });
    } catch (error) { next(error); }
  }

  // ── GET /reports/accounts-receivable ─────────────────────────────
  async accountsReceivable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      const { currency, minBalance } = req.query as Record<string, string>;
      const min = parseFloat(minBalance || '0.01');
      const fiscalMode = req.fiscalMode;

      const accounts = await (prisma as any).currentAccount.findMany({
        where: {
          customer: { companyId },
          ...(currency && { currency: currency as any }),
          ...(fiscalMode && { fiscalMode }),
          balance: { gt: min },
        },
        include: {
          customer: { select: { id: true, name: true, taxId: true, email: true, phone: true } },
        },
        orderBy: { balance: 'desc' },
      });

      const data = accounts.map((a: any) => ({
        customerId:   a.customer.id,
        customerName: a.customer.name,
        taxId:        a.customer.taxId ?? '—',
        email:        a.customer.email ?? '—',
        phone:        a.customer.phone ?? '—',
        currency:     a.currency,
        balance:      round2((a.balance as Decimal).toNumber()),
        creditLimit:  a.creditLimit ? round2((a.creditLimit as Decimal).toNumber()) : null,
      }));

      const totalBalance = round2(data.reduce((acc: number, r: { balance: number }) => acc + r.balance, 0));
      res.json({ status: 'success', data, totalBalance });
    } catch (error) { next(error); }
  }

  // ── GET /reports/cash-flow ────────────────────────────────────────
  async cashFlow(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      const { dateFrom, dateTo, cashRegisterId } = req.query as Record<string, string>;

      const where: Record<string, unknown> = { companyId, status: 'EMITTED', ...(req.fiscalMode && { fiscalMode: req.fiscalMode }) };
      if (cashRegisterId) where.cashRegisterId = cashRegisterId;
      if (dateFrom || dateTo) {
        where.date = {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo   && { lte: new Date(dateTo + 'T23:59:59') }),
        };
      }

      const recibos = await prisma.recibo.findMany({
        where,
        include: {
          customer:     { select: { id: true, name: true } },
          cashRegister: { select: { id: true, name: true } },
        },
        orderBy: { date: 'asc' },
      });

      const METHODS: Record<string, string> = {
        CASH: 'Efectivo', BANK_TRANSFER: 'Transferencia', CHECK: 'Cheque', CARD: 'Tarjeta',
      };

      const data = recibos.map((r) => ({
        id:               r.id,
        number:           r.number,
        date:             r.date.toISOString().substring(0, 10),
        customerName:     r.customer.name,
        cashRegister:     r.cashRegister?.name ?? '—',
        paymentMethod:    METHODS[r.paymentMethod] ?? r.paymentMethod,
        currency:         r.currency,
        amount:           round2((r.amount as Decimal).toNumber()),
        surchargeAmount:  r.surchargeAmount ? round2((r.surchargeAmount as Decimal).toNumber()) : 0,
        reference:        r.reference ?? '—',
      }));

      const totalAmount = round2(data.reduce((acc, r) => acc + r.amount, 0));
      res.json({ status: 'success', data, totalAmount });
    } catch (error) { next(error); }
  }
}
