import { randomUUID } from 'crypto';
import { injectable } from 'tsyringe';
import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  IInvoiceRepository,
  InvoiceFilters,
  InvoiceStats,
  InvoiceCurrencyStats,
} from '../../../domain/repositories/IInvoiceRepository';
import {
  Invoice,
  InvoiceWithItems,
  CreateInvoiceInput,
  UpdateInvoiceInput,
} from '../../../domain/entities/Invoice';
import { PaginationParams, PaginatedResult, InvoiceType } from '../../../shared/types';
import prisma from '../prisma';
import { allocateDocumentNumber, INVOICE_DOC_TYPE } from '../DocumentSequence';

@injectable()
export class PrismaInvoiceRepository implements IInvoiceRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findById(id: string, companyId?: string): Promise<InvoiceWithItems | null> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, ...(companyId ? ({ companyId } as any) : {}) },
      include: { customer: true, user: true },
    });
    if (!invoice) return null;
    const items = await this._fetchItemsRaw(id);

    // Columna nueva que el cliente Prisma (desactualizado) no selecciona.
    let warehouseId: string | null = null;
    try {
      const extra = await this.prisma.$queryRaw<{ warehouseId: string | null }[]>`
        SELECT "warehouseId" FROM "invoices" WHERE id = ${id} LIMIT 1
      `;
      warehouseId = extra[0]?.warehouseId ?? null;
    } catch { /* migración 20260713 pendiente */ }

    return { ...invoice, items, warehouseId } as unknown as InvoiceWithItems;
  }

  async findByNumber(number: string, companyId: string): Promise<Invoice | null> {
    // El número es único POR EMPRESA, no globalmente: sin companyId esta
    // búsqueda podría devolver el comprobante de otro inquilino.
    return this.prisma.invoice.findUnique({
      where: { companyId_number: { companyId, number } },
    });
  }

  /**
   * Filtros del listado, compartidos por `findAll` y `getStats`: los totales
   * de la tira de stats tienen que salir del MISMO conjunto que la tabla.
   */
  private buildWhere(filters: InvoiceFilters = {}): Prisma.InvoiceWhereInput {
    const where: Prisma.InvoiceWhereInput = {};

    if (filters.customerId) {
      where.customerId = filters.customerId;
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.status) {
      // Cast: Prisma client may not have AUTHORIZED yet (regenerate pending)
      where.status = filters.status as any;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.currency) {
      where.currency = filters.currency;
    }

    if (filters.saleCondition) {
      (where as any).saleCondition = filters.saleCondition;
    }

    if (filters.companyId) {
      (where as any).companyId = filters.companyId;
    }

    if (filters.fiscalMode) {
      (where as any).fiscalMode = filters.fiscalMode;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) {
        where.date.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.date.lte = filters.dateTo;
      }
    }

    // Búsqueda libre: número de comprobante, o razón social / CUIT del cliente.
    const search = filters.search?.trim();
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { taxId: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  async findAll(
    pagination: PaginationParams = { page: 1, limit: 10 },
    filters: InvoiceFilters = {}
  ): Promise<PaginatedResult<Invoice>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const where = this.buildWhere(filters);

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          customer: true,
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Totales del conjunto FILTRADO COMPLETO, no de la página.
   *
   * La tira de stats sumaba en el front el array de la página (25 filas) y lo
   * rotulaba "Total", al lado de un contador que sí venía del backend con las
   * N del filtro: dos escalas distintas en la misma tira.
   *
   * Los importes salen desglosados POR MONEDA y no se suman entre sí: la cuenta
   * corriente del cliente es por moneda, así que el dominio nunca convierte
   * (y las facturas en USD pueden llevar cotización 1, con lo cual convertir
   * daría un número falso sin avisar).
   *
   * `pending` y `overdue` se calculan sobre las facturas abiertas del filtro
   * (conjunto acotado), restando los recibos EMITTED de cada una. Las NC no
   * suman deuda: restan, así que quedan fuera del pendiente.
   */
  async getStats(filters: InvoiceFilters = {}): Promise<InvoiceStats> {
    const where = this.buildWhere(filters);

    const FACTURA_TYPES = ['FACTURA_A', 'FACTURA_B', 'FACTURA_C'];
    // Si el usuario filtró por un tipo, se respeta; si ese tipo es una NC/ND
    // no hay deuda que contar y la consulta se saltea.
    const openTypes = filters.type
      ? (FACTURA_TYPES.includes(filters.type) ? [filters.type] : [])
      : FACTURA_TYPES;

    const openWhere: Prisma.InvoiceWhereInput = {
      ...where,
      status: { in: ['ISSUED', 'AUTHORIZED', 'PARTIALLY_PAID'] as any },
      type: { in: openTypes as any },
    };

    const [grouped, open] = await Promise.all([
      (this.prisma as any).invoice.groupBy({
        by: ['currency'],
        where,
        _count: { _all: true },
        _sum: { total: true, taxAmount: true },
      }),
      openTypes.length === 0
        ? Promise.resolve([] as Array<{ id: string; total: Decimal; dueDate: Date | null; currency: string }>)
        : this.prisma.invoice.findMany({
            where: openWhere,
            select: { id: true, total: true, dueDate: true, currency: true },
          }),
    ]);

    const paidByInvoice = new Map<string, Decimal>();
    if (open.length > 0) {
      const paidRows = await (this.prisma as any).recibo.groupBy({
        by: ['invoiceId'],
        where: { status: 'EMITTED', invoiceId: { in: open.map((i: { id: string }) => i.id) } },
        _sum: { amount: true },
      });
      for (const row of paidRows as Array<{ invoiceId: string; _sum: { amount: Decimal | null } }>) {
        paidByInvoice.set(row.invoiceId, row._sum.amount ?? new Decimal(0));
      }
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const byCurrency = new Map<string, InvoiceCurrencyStats>();
    const tramo = (currency: string): InvoiceCurrencyStats => {
      let t = byCurrency.get(currency);
      if (!t) {
        t = {
          currency,
          count: 0, total: 0, taxAmount: 0,
          pendingCount: 0, pendingAmount: 0,
          overdueCount: 0, overdueAmount: 0,
        };
        byCurrency.set(currency, t);
      }
      return t;
    };

    for (const row of grouped as Array<{
      currency: string;
      _count: { _all: number };
      _sum: { total: Decimal | null; taxAmount: Decimal | null };
    }>) {
      const t = tramo(row.currency);
      t.count = row._count._all;
      t.total = Number(row._sum.total ?? 0);
      t.taxAmount = Number(row._sum.taxAmount ?? 0);
    }

    // Pendiente y vencido se acumulan en Decimal y recién al final pasan a
    // number: sumar floats factura por factura arrastra centavos.
    const pending = new Map<string, Decimal>();
    const overdue = new Map<string, Decimal>();

    for (const invoice of open) {
      const paid = paidByInvoice.get(invoice.id) ?? new Decimal(0);
      const outstanding = new Decimal(invoice.total).minus(paid);
      // Un redondeo puede dejar centavos: por debajo de $1 se considera saldada.
      if (outstanding.lessThan(1)) continue;

      const t = tramo(invoice.currency);
      pending.set(invoice.currency, (pending.get(invoice.currency) ?? new Decimal(0)).plus(outstanding));
      t.pendingCount += 1;

      if (invoice.dueDate && invoice.dueDate < startOfToday) {
        overdue.set(invoice.currency, (overdue.get(invoice.currency) ?? new Decimal(0)).plus(outstanding));
        t.overdueCount += 1;
      }
    }

    for (const [currency, amount] of pending) tramo(currency).pendingAmount = Number(amount);
    for (const [currency, amount] of overdue) tramo(currency).overdueAmount = Number(amount);

    const tramos = [...byCurrency.values()].sort((a, b) => b.total - a.total);

    return {
      count: tramos.reduce((acc, t) => acc + t.count, 0),
      byCurrency: tramos,
    };
  }

  async create(data: CreateInvoiceInput): Promise<InvoiceWithItems> {
    const companyId =
      (data as any).companyId ?? (() => { throw new Error('companyId is required'); })();
    const invoiceNumber = await this.getNextInvoiceNumber(data.type, companyId);

    // Factura C does not carry IVA (no discrimination, no tax)
    const isTypeC = data.type.endsWith('_C');

    const computedItems = data.items.map((item) => {
      const base = new Decimal(item.quantity).times(item.unitPrice);
      const discountPct = new Decimal(item.discountPct ?? 0);
      const discountAmt = base.times(discountPct).dividedBy(100);
      const subtotal = base.minus(discountAmt);
      const effectiveTaxRate = isTypeC ? 0 : item.taxRate;
      const taxAmount = subtotal.times(effectiveTaxRate).dividedBy(100);
      const total = subtotal.plus(taxAmount);
      return { productId: item.productId, variantId: (item as any).variantId ?? null, quantity: item.quantity, unitPrice: item.unitPrice, discountPct: Number(discountPct), taxRate: effectiveTaxRate, subtotal, taxAmount, total };
    });

    const subtotal = computedItems.reduce((acc, i) => acc.plus(i.subtotal), new Decimal(0));
    const taxAmount = computedItems.reduce((acc, i) => acc.plus(i.taxAmount), new Decimal(0));
    const total = subtotal.plus(taxAmount);

    const invoice = await (this.prisma as any).invoice.create({
      data: {
        type: data.type,
        number: invoiceNumber,
        customerId: data.customerId,
        userId: data.userId,
        ...(data.date ? { date: data.date } : {}),
        dueDate: data.dueDate,
        notes: data.notes,
        paymentTerms: data.paymentTerms,
        saleCondition: data.saleCondition ?? 'CONTADO',
        stockBehavior: (data as any).stockBehavior ?? 'DISCOUNT',
        originInvoiceId: (data as any).originInvoiceId ?? null,
        ordenPedidoId: (data as any).ordenPedidoId ?? null,
        companyId: (data as any).companyId ?? (() => { throw new Error('companyId is required'); })(),
        fiscalMode: (data as any).fiscalMode ?? 'FORMAL',
        subtotal,
        taxAmount,
        total,
        currency: data.currency,
        exchangeRate: new Decimal(data.exchangeRate),
      },
    });

    await this._insertItemsRaw(invoice.id, computedItems);

    return this.findById(invoice.id) as Promise<InvoiceWithItems>;
  }

  async update(id: string, data: UpdateInvoiceInput): Promise<Invoice> {
    return this.prisma.invoice.update({
      where: { id },
      data: data as any,
    });
  }

  async updateWithItems(id: string, data: CreateInvoiceInput): Promise<InvoiceWithItems> {
    // Factura C does not carry IVA (no discrimination, no tax)
    const isTypeC = data.type.endsWith('_C');

    const computedItems = data.items.map((item) => {
      const base = new Decimal(item.quantity).times(item.unitPrice);
      const discountPct = new Decimal(item.discountPct ?? 0);
      const discountAmt = base.times(discountPct).dividedBy(100);
      const subtotal = base.minus(discountAmt);
      const effectiveTaxRate = isTypeC ? 0 : item.taxRate;
      const taxAmount = subtotal.times(effectiveTaxRate).dividedBy(100);
      const total = subtotal.plus(taxAmount);
      return { productId: item.productId, variantId: (item as any).variantId ?? null, quantity: item.quantity, unitPrice: item.unitPrice, discountPct: Number(discountPct), taxRate: effectiveTaxRate, subtotal, taxAmount, total };
    });

    const subtotal = computedItems.reduce((acc, i) => acc.plus(i.subtotal), new Decimal(0));
    const taxAmount = computedItems.reduce((acc, i) => acc.plus(i.taxAmount), new Decimal(0));
    const total = subtotal.plus(taxAmount);

    await this.prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await (this.prisma as any).invoice.update({
      where: { id },
      data: {
        type: data.type,
        customerId: data.customerId,
        dueDate: data.dueDate ?? null,
        notes: data.notes ?? null,
        paymentTerms: data.paymentTerms ?? null,
        saleCondition: data.saleCondition ?? 'CONTADO',
        originInvoiceId: (data as any).originInvoiceId ?? null,
        subtotal,
        taxAmount,
        total,
        currency: data.currency,
        exchangeRate: new Decimal(data.exchangeRate),
      },
    });

    await this._insertItemsRaw(id, computedItems);

    return this.findById(id) as Promise<InvoiceWithItems>;
  }

  private async _fetchItemsRaw(invoiceId: string): Promise<any[]> {
    const colCheck = await this.prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invoice_items' AND column_name = 'discountPct'
      ) AS "exists"
    `;
    const hasDiscount = colCheck[0]?.exists ?? false;

    const rows = hasDiscount
      ? await this.prisma.$queryRaw<any[]>`
          SELECT ii.id, ii."invoiceId", ii."productId", ii."variantId",
            ii.quantity, ii."unitPrice", ii."discountPct",
            ii."taxRate", ii.subtotal, ii."taxAmount", ii.total,
            p.id AS "prod_id", p.name AS "prod_name", p.sku AS "prod_sku",
            p."taxRate" AS "prod_taxRate", p.price AS "prod_price",
            p.barcode AS "prod_barcode", p.description AS "prod_description",
            v.id AS "var_id", v.name AS "var_name", v.sku AS "var_sku", v.attributes AS "var_attributes"
          FROM "invoice_items" ii
          JOIN "products" p ON p.id = ii."productId"
          LEFT JOIN "product_variants" v ON v.id = ii."variantId"
          WHERE ii."invoiceId" = ${invoiceId}
        `
      : await this.prisma.$queryRaw<any[]>`
          SELECT ii.id, ii."invoiceId", ii."productId", ii."variantId",
            ii.quantity, ii."unitPrice", 0 AS "discountPct",
            ii."taxRate", ii.subtotal, ii."taxAmount", ii.total,
            p.id AS "prod_id", p.name AS "prod_name", p.sku AS "prod_sku",
            p."taxRate" AS "prod_taxRate", p.price AS "prod_price",
            p.barcode AS "prod_barcode", p.description AS "prod_description",
            v.id AS "var_id", v.name AS "var_name", v.sku AS "var_sku", v.attributes AS "var_attributes"
          FROM "invoice_items" ii
          JOIN "products" p ON p.id = ii."productId"
          LEFT JOIN "product_variants" v ON v.id = ii."variantId"
          WHERE ii."invoiceId" = ${invoiceId}
        `;
    return rows.map((r) => ({
      id: r.id,
      invoiceId: r.invoiceId,
      productId: r.productId,
      variantId: r.variantId ?? null,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      discountPct: r.discountPct,
      taxRate: r.taxRate,
      subtotal: r.subtotal,
      taxAmount: r.taxAmount,
      total: r.total,
      product: {
        id: r.prod_id,
        name: r.prod_name,
        sku: r.prod_sku,
        taxRate: r.prod_taxRate,
        price: r.prod_price,
        barcode: r.prod_barcode,
        description: r.prod_description,
      },
      variant: r.var_id ? {
        id: r.var_id,
        name: r.var_name,
        sku: r.var_sku,
        attributes: r.var_attributes ?? {},
      } : null,
    }));
  }

  private async _insertItemsRaw(invoiceId: string, items: any[]): Promise<void> {
    const colCheck = await this.prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invoice_items' AND column_name = 'discountPct'
      ) AS "exists"
    `;
    const hasDiscount = colCheck[0]?.exists ?? false;

    for (const item of items) {
      const itemId = randomUUID();
      const variantId = item.variantId ?? null;
      if (hasDiscount) {
        await this.prisma.$executeRaw`
          INSERT INTO "invoice_items"
            (id, "invoiceId", "productId", "variantId", quantity, "unitPrice", "discountPct", "taxRate", subtotal, "taxAmount", total)
          VALUES
            (${itemId}, ${invoiceId}, ${item.productId}, ${variantId}, ${Number(item.quantity)},
             ${Number(item.unitPrice)}, ${Number(item.discountPct)}, ${Number(item.taxRate)},
             ${Number(item.subtotal)}, ${Number(item.taxAmount)}, ${Number(item.total)})
        `;
      } else {
        await this.prisma.$executeRaw`
          INSERT INTO "invoice_items"
            (id, "invoiceId", "productId", "variantId", quantity, "unitPrice", "taxRate", subtotal, "taxAmount", total)
          VALUES
            (${itemId}, ${invoiceId}, ${item.productId}, ${variantId}, ${Number(item.quantity)},
             ${Number(item.unitPrice)}, ${Number(item.taxRate)},
             ${Number(item.subtotal)}, ${Number(item.taxAmount)}, ${Number(item.total)})
        `;
      }
    }
  }

  async delete(id: string): Promise<void> {
    await this.prisma.invoice.delete({ where: { id } });
  }

  /**
   * Numeración interna del comprobante (FA-2026-00000042).
   *
   * Antes esto era un `MAX(number)+1` sin lock y sin filtrar por empresa: dos
   * ventas simultáneas sacaban el mismo número, y la numeración se mezclaba
   * entre inquilinos dejando huecos en la correlatividad. Ahora sale de la
   * secuencia atómica por (empresa, tipo, año).
   *
   * No confundir con la numeración fiscal de ARCA (punto de venta + CAE), que
   * la resuelve PdvService contra FECompUltimoAutorizado.
   */
  async getNextInvoiceNumber(
    type: InvoiceType,
    companyId: string,
    tx?: Prisma.TransactionClient
  ): Promise<string> {
    return allocateDocumentNumber(INVOICE_DOC_TYPE[type], companyId, { tx });
  }

}
