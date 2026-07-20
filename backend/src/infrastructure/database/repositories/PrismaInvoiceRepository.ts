import { randomUUID } from 'crypto';
import { injectable } from 'tsyringe';
import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { IInvoiceRepository, InvoiceFilters } from '../../../domain/repositories/IInvoiceRepository';
import {
  Invoice,
  InvoiceWithItems,
  CreateInvoiceInput,
  UpdateInvoiceInput,
} from '../../../domain/entities/Invoice';
import { PaginationParams, PaginatedResult, InvoiceType } from '../../../shared/types';
import prisma from '../prisma';

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

  async findByNumber(number: string): Promise<Invoice | null> {
    return this.prisma.invoice.findUnique({ where: { number } });
  }

  async findAll(
    pagination: PaginationParams = { page: 1, limit: 10 },
    filters: InvoiceFilters = {}
  ): Promise<PaginatedResult<Invoice>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

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

  async create(data: CreateInvoiceInput): Promise<InvoiceWithItems> {
    const invoiceNumber = await this.getNextInvoiceNumber(data.type);

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

  async getNextInvoiceNumber(type: InvoiceType): Promise<string> {
    const prefix = this.getTypePrefix(type);
    const year = new Date().getFullYear();
    const paddedNumber = await this.getNextSequence(type, year);

    return `${prefix}-${year}-${paddedNumber}`;
  }

  private getTypePrefix(type: InvoiceType): string {
    const prefixes: Record<InvoiceType, string> = {
      FACTURA_A: 'FA',
      FACTURA_B: 'FB',
      FACTURA_C: 'FC',
      NOTA_CREDITO_A: 'NCA',
      NOTA_CREDITO_B: 'NCB',
      NOTA_CREDITO_C: 'NCC',
      NOTA_DEBITO_A: 'NDA',
      NOTA_DEBITO_B: 'NDB',
      NOTA_DEBITO_C: 'NDC',
    };
    return prefixes[type];
  }

  private async getNextSequence(type: InvoiceType, year: number): Promise<string> {
    const prefix = this.getTypePrefix(type);
    const pattern = `${prefix}-${year}-%`;

    const lastInvoice = await this.prisma.invoice.findFirst({
      where: {
        number: { startsWith: `${prefix}-${year}-` },
      },
      orderBy: { number: 'desc' },
    });

    let nextNumber = 1;
    if (lastInvoice) {
      const parts = lastInvoice.number.split('-');
      const lastNumber = parseInt(parts[parts.length - 1], 10);
      nextNumber = lastNumber + 1;
    }

    return nextNumber.toString().padStart(8, '0');
  }
}
