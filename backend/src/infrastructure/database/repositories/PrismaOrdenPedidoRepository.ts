import { randomUUID } from 'crypto';
import { injectable } from 'tsyringe';
import { Decimal } from '@prisma/client/runtime/library';
import { IOrdenPedidoRepository, OrdenPedidoFilters } from '../../../domain/repositories/IOrdenPedidoRepository';
import {
  OrdenPedido,
  OrdenPedidoWithItems,
  CreateOrdenPedidoInput,
  UpdateOrdenPedidoInput,
} from '../../../domain/entities/OrdenPedido';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

const includeWithoutItems = {
  customer: { select: { id: true, name: true, taxId: true, email: true, address: true } },
  user: { select: { id: true, name: true } },
  invoice: { select: { id: true, number: true, status: true } },
  cashRegister: { select: { id: true, name: true } },
  invoiceCashRegister: { select: { id: true, name: true } },
};

@injectable()
export class PrismaOrdenPedidoRepository implements IOrdenPedidoRepository {
  async findAll(
    pagination: PaginationParams = { page: 1, limit: 20 },
    filters: OrdenPedidoFilters = {}
  ): Promise<PaginatedResult<OrdenPedido>> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.status) where.status = filters.status;
    if (filters.currency) where.currency = filters.currency;
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.fiscalMode) where.fiscalMode = filters.fiscalMode;
    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = filters.dateFrom;
      if (filters.dateTo) where.date.lte = filters.dateTo;
    }
    if (filters.search) {
      where.OR = [
        { number: { contains: filters.search, mode: 'insensitive' } },
        { customer: { name: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      (prisma as any).ordenPedido.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          customer: { select: { id: true, name: true, taxId: true } },
          user: { select: { id: true, name: true } },
          remitos: { select: { id: true, number: true, status: true } },
        },
      }),
      (prisma as any).ordenPedido.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<OrdenPedidoWithItems | null> {
    const op = await (prisma as any).ordenPedido.findUnique({
      where: { id },
      include: includeWithoutItems,
    });
    if (!op) return null;
    const items = await this._fetchItemsRaw(id);
    return { ...op, items } as OrdenPedidoWithItems;
  }

  async create(data: CreateOrdenPedidoInput): Promise<OrdenPedidoWithItems> {
    const number = await this.getNextNumber();
    const companyId = (data as any).companyId ?? (() => { throw new Error('companyId is required'); })();

    const op = await (prisma as any).ordenPedido.create({
      data: {
        number,
        customerId: data.customerId ?? null,
        userId: data.userId,
        dueDate: data.dueDate ?? null,
        currency: data.currency,
        exchangeRate: new Decimal(data.exchangeRate),
        notes: data.notes ?? null,
        paymentTerms: data.paymentTerms ?? null,
        saleCondition: data.saleCondition ?? 'CONTADO',
        stockBehavior: data.stockBehavior ?? 'DISCOUNT',
        companyId,
        fiscalMode: (data as any).fiscalMode ?? 'FORMAL',
        cashRegisterId: (data as any).cashRegisterId ?? null,
        invoiceCashRegisterId: (data as any).invoiceCashRegisterId ?? null,
        subtotal: new Decimal(data.subtotal),
        taxAmount: new Decimal(data.taxAmount),
        total: new Decimal(data.total),
      },
    });

    await this._insertItemsRaw(op.id, data.items);

    return this.findById(op.id) as Promise<OrdenPedidoWithItems>;
  }

  async update(id: string, data: UpdateOrdenPedidoInput): Promise<OrdenPedidoWithItems> {
    const { items, ...rest } = data;

    // Build SET clauses dynamically to only update provided fields
    const fields: string[] = [];
    const values: any[] = [];

    // col: SQL column expression (with cast if needed)
    const fieldMap: Record<string, string> = {
      customerId:           '"customerId"',
      userId:               '"userId"',
      dueDate:              '"dueDate"',
      currency:             '"currency"',
      exchangeRate:         '"exchangeRate"',
      notes:                '"notes"',
      paymentTerms:         '"paymentTerms"',
      saleCondition:        '"saleCondition"',
      stockBehavior:        '"stockBehavior"',
      warehouseId:          '"warehouseId"',
      cashRegisterId:       '"cashRegisterId"',
      invoiceCashRegisterId:'"invoiceCashRegisterId"',
      subtotal:             '"subtotal"',
      taxAmount:            '"taxAmount"',
      total:                '"total"',
      status:               '"status"',
      invoiceId:            '"invoiceId"',
    };

    // Enum columns that need an explicit PostgreSQL cast
    const enumCasts: Record<string, string> = {
      currency: '"Currency"',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in rest) {
        const cast = enumCasts[key] ? `::${enumCasts[key]}` : '';
        fields.push(`${col} = $${fields.length + 1}${cast}`);
        values.push((rest as any)[key] ?? null);
      }
    }
    fields.push(`"updatedAt" = NOW()`);

    if (fields.length > 1) {
      const setClause = fields.join(', ');
      values.push(id);
      await prisma.$executeRawUnsafe(
        `UPDATE "orden_pedidos" SET ${setClause} WHERE id = $${values.length}`,
        ...values
      );
    }

    if (items) {
      await prisma.$executeRaw`DELETE FROM "orden_pedido_items" WHERE "ordenPedidoId" = ${id}`;
      await this._insertItemsRaw(id, items);
    }

    return this.findById(id) as Promise<OrdenPedidoWithItems>;
  }

  async delete(id: string): Promise<void> {
    await (prisma as any).ordenPedido.delete({ where: { id } });
  }

  private async _fetchItemsRaw(ordenPedidoId: string): Promise<any[]> {
    // Check if discountPct column exists (migration may not be applied yet)
    const colCheck = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orden_pedido_items' AND column_name = 'discountPct'
      ) AS "exists"
    `;
    const hasDiscount = colCheck[0]?.exists ?? false;

    const rows = hasDiscount
      ? await prisma.$queryRaw<any[]>`
          SELECT opi.id, opi."ordenPedidoId", opi."productId", opi."variantId", opi.description,
            opi.quantity, opi."unitPrice", opi."discountPct",
            opi."taxRate", opi.subtotal, opi."taxAmount", opi.total,
            p.id AS "prod_id", p.name AS "prod_name", p.sku AS "prod_sku",
            v.id AS "var_id", v.name AS "var_name", v.sku AS "var_sku", v.attributes AS "var_attributes"
          FROM "orden_pedido_items" opi
          LEFT JOIN "products" p ON p.id = opi."productId"
          LEFT JOIN "product_variants" v ON v.id = opi."variantId"
          WHERE opi."ordenPedidoId" = ${ordenPedidoId}
        `
      : await prisma.$queryRaw<any[]>`
          SELECT opi.id, opi."ordenPedidoId", opi."productId", opi."variantId", opi.description,
            opi.quantity, opi."unitPrice", 0 AS "discountPct",
            opi."taxRate", opi.subtotal, opi."taxAmount", opi.total,
            p.id AS "prod_id", p.name AS "prod_name", p.sku AS "prod_sku",
            v.id AS "var_id", v.name AS "var_name", v.sku AS "var_sku", v.attributes AS "var_attributes"
          FROM "orden_pedido_items" opi
          LEFT JOIN "products" p ON p.id = opi."productId"
          LEFT JOIN "product_variants" v ON v.id = opi."variantId"
          WHERE opi."ordenPedidoId" = ${ordenPedidoId}
        `;
    return rows.map((r) => ({
      id: r.id,
      ordenPedidoId: r.ordenPedidoId,
      productId: r.productId,
      variantId: r.variantId ?? null,
      description: r.description,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      discountPct: r.discountPct,
      taxRate: r.taxRate,
      subtotal: r.subtotal,
      taxAmount: r.taxAmount,
      total: r.total,
      product: r.prod_id ? { id: r.prod_id, name: r.prod_name, sku: r.prod_sku } : null,
      variant: r.var_id ? { id: r.var_id, name: r.var_name, sku: r.var_sku, attributes: r.var_attributes ?? {} } : null,
    }));
  }

  private async _insertItemsRaw(ordenPedidoId: string, items: any[]): Promise<void> {
    const colCheck = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orden_pedido_items' AND column_name = 'discountPct'
      ) AS "exists"
    `;
    const hasDiscount = colCheck[0]?.exists ?? false;

    for (const item of items) {
      const itemId = randomUUID();
      const productId = item.productId ?? null;
      const variantId = item.variantId ?? null;
      const discountPct = Number(item.discountPct ?? 0);
      if (hasDiscount) {
        await prisma.$executeRaw`
          INSERT INTO "orden_pedido_items"
            (id, "ordenPedidoId", "productId", "variantId", description, quantity, "unitPrice", "discountPct", "taxRate", subtotal, "taxAmount", total)
          VALUES
            (${itemId}, ${ordenPedidoId}, ${productId}, ${variantId}, ${item.description},
             ${Number(item.quantity)}, ${Number(item.unitPrice)}, ${discountPct},
             ${Number(item.taxRate)}, ${Number(item.subtotal)}, ${Number(item.taxAmount)}, ${Number(item.total)})
        `;
      } else {
        await prisma.$executeRaw`
          INSERT INTO "orden_pedido_items"
            (id, "ordenPedidoId", "productId", "variantId", description, quantity, "unitPrice", "taxRate", subtotal, "taxAmount", total)
          VALUES
            (${itemId}, ${ordenPedidoId}, ${productId}, ${variantId}, ${item.description},
             ${Number(item.quantity)}, ${Number(item.unitPrice)},
             ${Number(item.taxRate)}, ${Number(item.subtotal)}, ${Number(item.taxAmount)}, ${Number(item.total)})
        `;
      }
    }
  }

  async getNextNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `OP-${year}-`;
    const rows = await prisma.$queryRaw<{ number: string }[]>`
      SELECT number FROM "orden_pedidos"
      WHERE number LIKE ${prefix + '%'}
      ORDER BY number DESC
      LIMIT 1
    `;
    const lastSeq = rows.length > 0 ? parseInt(rows[0].number.replace(prefix, ''), 10) : 0;
    const seq = String(lastSeq + 1).padStart(4, '0');
    return `${prefix}${seq}`;
  }
}
