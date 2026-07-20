import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../../database/prisma';

const round2 = (n: number) => Math.round(n * 100) / 100;

type AgingRow = {
  entityId: string;
  name: string;
  date: Date;
  dueDate: Date | null;
  total: number;
  paid: number;
};

type AgingEntity = {
  entityId: string;
  name: string;
  notDue: number;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
  docCount: number;
};

// Agrupa comprobantes impagos por entidad y balde de antigüedad. La edad se
// mide desde el vencimiento (o la fecha del comprobante si no tiene); lo que
// aún no venció va a "notDue".
function bucketizeAging(rows: AgingRow[]): AgingEntity[] {
  const byEntity = new Map<string, AgingEntity>();
  const now = Date.now();
  for (const r of rows) {
    const pending = round2(Number(r.total) - Number(r.paid));
    if (pending <= 0.01) continue;
    const base = r.dueDate ?? r.date;
    const days = Math.floor((now - new Date(base).getTime()) / 86400000);
    const bucket: keyof Pick<AgingEntity, 'notDue' | 'd0_30' | 'd31_60' | 'd61_90' | 'd90plus'> =
      r.dueDate && days <= 0 ? 'notDue'
      : days <= 30 ? 'd0_30'
      : days <= 60 ? 'd31_60'
      : days <= 90 ? 'd61_90'
      : 'd90plus';
    const e = byEntity.get(r.entityId) ?? {
      entityId: r.entityId, name: r.name,
      notDue: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0, docCount: 0,
    };
    e[bucket] = round2(e[bucket] + pending);
    e.total = round2(e.total + pending);
    e.docCount += 1;
    byEntity.set(r.entityId, e);
  }
  return Array.from(byEntity.values()).sort((a, b) => b.total - a.total);
}

export class ReportsController {

  // ── GET /reports/cc-aging ────────────────────────────────────────
  // Deuda por antigüedad (a vencer / 0-30 / 31-60 / 61-90 / +90 días) por
  // cliente y por proveedor, basada en comprobantes impagos (open items),
  // no en el saldo acumulado de la cuenta.
  async ccAging(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      const fiscalMode = req.fiscalMode ?? 'FORMAL';

      // Clientes: facturas y ND de cuenta corriente con saldo pendiente.
      const customerRows = await prisma.$queryRaw<AgingRow[]>`
        SELECT i."customerId" AS "entityId", c.name, i.date, i."dueDate",
               i.total::float8 AS total, COALESCE(p.paid, 0)::float8 AS paid
        FROM "invoices" i
        JOIN "customers" c ON c.id = i."customerId"
        LEFT JOIN (
          SELECT "invoiceId", SUM(amount) AS paid
          FROM "recibos" WHERE status = 'EMITTED' GROUP BY "invoiceId"
        ) p ON p."invoiceId" = i.id
        WHERE i."companyId" = ${companyId}
          AND i."fiscalMode" = ${fiscalMode}
          AND i."saleCondition" = 'CUENTA_CORRIENTE'
          AND i.status::text IN ('ISSUED', 'AUTHORIZED', 'PARTIALLY_PAID')
          AND (i.type::text LIKE 'FACTURA%' OR i.type::text LIKE 'NOTA_DEBITO%')
      `;

      // Proveedores: facturas de compra pendientes (imputación por OP pagadas).
      const supplierRows = await prisma.$queryRaw<AgingRow[]>`
        SELECT pi."supplierId" AS "entityId", s.name, pi.date, pi."dueDate",
               pi.amount::float8 AS total, COALESCE(p.paid, 0)::float8 AS paid
        FROM "purchase_invoices" pi
        JOIN "suppliers" s ON s.id = pi."supplierId"
        LEFT JOIN (
          SELECT opi."purchaseInvoiceId", SUM(opi.amount) AS paid
          FROM "orden_pago_items" opi
          JOIN "orden_pagos" op ON op.id = opi."ordenPagoId"
          WHERE op.status = 'PAID'
          GROUP BY opi."purchaseInvoiceId"
        ) p ON p."purchaseInvoiceId" = pi.id
        WHERE pi."companyId" = ${companyId}
          AND pi."fiscalMode" = ${fiscalMode}
          AND pi."supplierId" IS NOT NULL
          AND pi.status IN ('PENDING', 'PARTIALLY_PAID')
          AND pi.type NOT LIKE 'NOTA_CREDITO%'
      `;

      res.json({
        status: 'success',
        customers: bucketizeAging(customerRows),
        suppliers: bucketizeAging(supplierRows),
      });
    } catch (error) { next(error); }
  }

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

      // Órdenes de pedido NO convertidas también cuentan como ventas (mismo dedup que
      // el dashboard: las convertidas ya están representadas por su factura). Se omiten
      // cuando el filtro es específico de factura (type/status), porque las OP no los tienen.
      const includeOPs = !type && !status;
      if (includeOPs) {
        const opConditions: Prisma.Sql[] = [
          Prisma.sql`op."companyId" = ${companyId}`,
          Prisma.sql`op.status IN ('CONFIRMED', 'PARTIALLY_PAID', 'PAID')`,
          Prisma.sql`op."invoiceId" IS NULL`,
          Prisma.sql`opi."productId" IS NOT NULL`,
        ];
        if (req.fiscalMode) opConditions.push(Prisma.sql`op."fiscalMode" = ${req.fiscalMode}`);
        if (currency)       opConditions.push(Prisma.sql`op.currency::text = ${currency}`);
        if (customerId)     opConditions.push(Prisma.sql`op."customerId" = ${customerId}`);
        if (dateFrom)       opConditions.push(Prisma.sql`op.date >= ${new Date(dateFrom)}`);
        if (dateTo)         opConditions.push(Prisma.sql`op.date <= ${new Date(dateTo)}`);
        const opWhere = Prisma.join(opConditions, ' AND ');

        const opRows = await prisma.$queryRaw<Array<{
          ordenPedidoId: string; productId: string; productName: string; productSku: string;
          quantity: Decimal; subtotal: Decimal; taxAmount: Decimal; total: Decimal;
        }>>`
          SELECT op.id AS "ordenPedidoId", opi."productId",
                 p.name AS "productName", p.sku AS "productSku",
                 opi.quantity, opi.subtotal, opi."taxAmount", opi.total
          FROM "orden_pedido_items" opi
          JOIN "orden_pedidos" op ON op.id = opi."ordenPedidoId"
          JOIN "products" p ON p.id = opi."productId"
          WHERE ${opWhere}
        `;

        for (const row of opRows) {
          const qty = Number(row.quantity);
          const sub = Number(row.subtotal);
          const tax = Number(row.taxAmount);
          const tot = Number(row.total);

          const ex = map.get(row.productId);
          if (ex) {
            ex.invoiceIds.add(row.ordenPedidoId);
            ex.quantity += qty; ex.subtotal += sub;
            ex.taxAmount += tax; ex.total += tot;
          } else {
            map.set(row.productId, {
              productId: row.productId, productName: row.productName,
              productSku: row.productSku, invoiceIds: new Set([row.ordenPedidoId]),
              quantity: qty, subtotal: sub, taxAmount: tax, total: tot,
            });
          }
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
  // Agrega desde las facturas de compra (documento de primer nivel del flujo
  // actual). La antigua tabla `purchases` quedó fuera del flujo.
  async purchasesBySupplier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      const { dateFrom, dateTo, supplierId, status } = req.query as Record<string, string>;

      const conditions: Prisma.Sql[] = [Prisma.sql`pi."companyId" = ${companyId}`];
      if (req.fiscalMode) conditions.push(Prisma.sql`pi."fiscalMode" = ${req.fiscalMode}`);
      if (supplierId)     conditions.push(Prisma.sql`pi."supplierId" = ${supplierId}`);
      if (status)         conditions.push(Prisma.sql`pi.status = ${status}`);
      if (dateFrom)       conditions.push(Prisma.sql`pi.date >= ${new Date(dateFrom)}`);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        conditions.push(Prisma.sql`pi.date <= ${to}`);
      }
      const where = Prisma.join(conditions, ' AND ');

      const rows = await prisma.$queryRaw<any[]>`
        SELECT s.id AS "supplierId", s.name AS "supplierName", s.cuit AS "supplierCuit",
               COUNT(pi.id)::int          AS "purchaseCount",
               COALESCE(SUM(pi.subtotal), 0)      AS "subtotal",
               COALESCE(SUM(pi."taxAmount"), 0)   AS "taxAmount",
               COALESCE(SUM(pi.amount), 0)        AS "total"
        FROM "purchase_invoices" pi
        JOIN "suppliers" s ON s.id = pi."supplierId"
        WHERE ${where}
        GROUP BY s.id, s.name, s.cuit
        ORDER BY "total" DESC
      `;

      const data = rows.map((r) => ({
        supplierId:    r.supplierId,
        supplierName:  r.supplierName,
        supplierCuit:  r.supplierCuit ?? '—',
        purchaseCount: Number(r.purchaseCount),
        subtotal:      round2(Number(r.subtotal)),
        taxAmount:     round2(Number(r.taxAmount)),
        total:         round2(Number(r.total)),
      }));

      res.json({ status: 'success', data });
    } catch (error) { next(error); }
  }

  // ── GET /reports/profitability ────────────────────────────────────
  async profitability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      const { rubroId, brandId } = req.query as Record<string, string>;

      const where: Record<string, unknown> = { companyId, isActive: true };
      if (rubroId) where.rubroId = rubroId;
      if (brandId)    where.brandId    = brandId;

      const products = await prisma.product.findMany({
        where,
        include: {
          rubro: { select: { name: true } },
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
            rubro:   (p as any).rubro?.name ?? '—',
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
      const { warehouseId, rubroId } = req.query as Record<string, string>;

      const stockWhere: Record<string, unknown> = {
        warehouse: { companyId },
        quantity:  { gt: 0 },
      };
      if (warehouseId) stockWhere.warehouseId = warehouseId;
      if (rubroId)  stockWhere.product = { rubroId };

      const stocks = await prisma.stock.findMany({
        where: stockWhere,
        include: {
          product:   { include: { rubro: { select: { name: true } } } },
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
            rubro:    (s.product as any).rubro?.name ?? '—',
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

  // ── GET /reports/purchase-invoices ───────────────────────────────
  async purchaseInvoices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      const { dateFrom, dateTo, supplierId, status, paymentMethod, dateField } = req.query as Record<string, string>;
      const fiscalMode = req.fiscalMode;

      // La factura es documento de primer nivel: filtramos/joineamos por `pi`.
      // `purchases` queda como LEFT JOIN legacy (opcional, puede no existir).
      const DATE_FIELDS: Record<string, string> = {
        imputationDate: `pi."imputationDate"`,
        dueDate:        `pi."dueDate"`,
        createdAt:      `pi."createdAt"`,
        purchaseDate:   `pi."date"`,
        date:           `pi."date"`,
      };
      const dateColumn = DATE_FIELDS[dateField] ?? DATE_FIELDS.imputationDate;

      const conditions: string[] = [`pi."companyId" = $1`];
      const params: any[] = [companyId];
      let i = 2;

      if (fiscalMode)     { conditions.push(`pi."fiscalMode" = $${i++}`);   params.push(fiscalMode); }
      if (supplierId)     { conditions.push(`pi."supplierId" = $${i++}`);   params.push(supplierId); }
      if (status)         { conditions.push(`pi.status = $${i++}`);          params.push(status); }
      if (paymentMethod)  { conditions.push(`pi."paymentMethod" = $${i++}`); params.push(paymentMethod); }
      if (dateFrom)       { conditions.push(`${dateColumn} >= $${i++}`);     params.push(new Date(dateFrom)); }
      if (dateTo)         { conditions.push(`${dateColumn} <= $${i++}`);     params.push(new Date(dateTo + 'T23:59:59')); }

      const where = conditions.join(' AND ');

      const rows = await prisma.$queryRawUnsafe<any[]>(`
        SELECT
          pi.id, pi.number, pi.type, pi.subtotal, pi."taxRate", pi."taxAmount", pi.amount,
          pi."dueDate", pi."imputationDate", pi."paymentMethod", pi.status, pi.notes,
          pi."createdAt", pi.date AS "invoiceDate", pi.currency,
          p.id AS "purchaseId", p.number AS "purchaseNumber", p.date AS "purchaseDate",
          s.id AS "supplierId", s.name AS "supplierName", s.cuit AS "supplierCuit",
          COALESCE((SELECT SUM(amount) FROM "purchase_invoice_retenciones" WHERE "purchaseInvoiceId" = pi.id), 0) AS "retencionesTotal",
          COALESCE((
            SELECT SUM(opi.amount)
            FROM "orden_pago_items" opi
            JOIN "orden_pagos" op ON op.id = opi."ordenPagoId"
            WHERE opi."purchaseInvoiceId" = pi.id AND op.status = 'PAID'
          ), 0) AS "paidAmount"
        FROM "purchase_invoices" pi
        LEFT JOIN "purchases" p ON p.id = pi."purchaseId"
        JOIN "suppliers" s ON s.id = pi."supplierId"
        WHERE ${where}
        ORDER BY pi."imputationDate" DESC NULLS LAST, pi."createdAt" DESC
      `, ...params);

      const data = rows.map((r) => {
        const subtotal      = Number(r.subtotal ?? 0);
        const taxAmount     = Number(r.taxAmount ?? 0);
        const amount        = Number(r.amount ?? 0);
        const retenciones   = Number(r.retencionesTotal ?? 0);
        const net           = amount - retenciones;
        const paid          = Math.min(Number(r.paidAmount ?? 0), net);
        const pending       = Math.max(net - paid, 0);
        return {
          id:             r.id,
          number:         r.number,
          type:           r.type,
          subtotal:       round2(subtotal),
          taxAmount:      round2(taxAmount),
          amount:         round2(amount),
          retenciones:    round2(retenciones),
          net:            round2(net),
          paid:           round2(paid),
          pending:        round2(pending),
          dueDate:        r.dueDate        ? r.dueDate.toISOString().substring(0, 10)        : null,
          imputationDate: r.imputationDate ? r.imputationDate.toISOString().substring(0, 10) : null,
          invoiceDate:    r.invoiceDate    ? r.invoiceDate.toISOString().substring(0, 10)    : null,
          paymentMethod:  r.paymentMethod,
          status:         r.status,
          notes:          r.notes,
          purchaseId:     r.purchaseId ?? null,
          purchaseNumber: r.purchaseNumber ?? null,
          purchaseDate:   r.purchaseDate ? r.purchaseDate.toISOString().substring(0, 10) : null,
          currency:       r.currency,
          supplierId:     r.supplierId,
          supplierName:   r.supplierName,
          supplierCuit:   r.supplierCuit ?? '—',
        };
      });

      const totals = {
        count:        data.length,
        subtotal:     round2(data.reduce((a, r) => a + r.subtotal,    0)),
        taxAmount:    round2(data.reduce((a, r) => a + r.taxAmount,   0)),
        amount:       round2(data.reduce((a, r) => a + r.amount,      0)),
        retenciones:  round2(data.reduce((a, r) => a + r.retenciones, 0)),
        net:          round2(data.reduce((a, r) => a + r.net,         0)),
        pending:      round2(data.reduce((a, r) => a + r.pending,     0)),
        paid:         round2(data.reduce((a, r) => a + r.paid,        0)),
      };

      res.json({ status: 'success', data, totals });
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
