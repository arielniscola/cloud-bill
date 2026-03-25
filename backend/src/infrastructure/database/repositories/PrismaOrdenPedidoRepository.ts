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

    if (items) {
      await (prisma as any).ordenPedidoItem.deleteMany({ where: { ordenPedidoId: id } });
      await (prisma as any).ordenPedido.update({ where: { id }, data: rest });
      await this._insertItemsRaw(id, items);
    } else {
      await (prisma as any).ordenPedido.update({ where: { id }, data: rest });
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
          SELECT opi.id, opi."ordenPedidoId", opi."productId", opi.description,
            opi.quantity, opi."unitPrice", opi."discountPct",
            opi."taxRate", opi.subtotal, opi."taxAmount", opi.total,
            p.id AS "prod_id", p.name AS "prod_name", p.sku AS "prod_sku"
          FROM "orden_pedido_items" opi
          LEFT JOIN "products" p ON p.id = opi."productId"
          WHERE opi."ordenPedidoId" = ${ordenPedidoId}
        `
      : await prisma.$queryRaw<any[]>`
          SELECT opi.id, opi."ordenPedidoId", opi."productId", opi.description,
            opi.quantity, opi."unitPrice", 0 AS "discountPct",
            opi."taxRate", opi.subtotal, opi."taxAmount", opi.total,
            p.id AS "prod_id", p.name AS "prod_name", p.sku AS "prod_sku"
          FROM "orden_pedido_items" opi
          LEFT JOIN "products" p ON p.id = opi."productId"
          WHERE opi."ordenPedidoId" = ${ordenPedidoId}
        `;
    return rows.map((r) => ({
      id: r.id,
      ordenPedidoId: r.ordenPedidoId,
      productId: r.productId,
      description: r.description,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      discountPct: r.discountPct,
      taxRate: r.taxRate,
      subtotal: r.subtotal,
      taxAmount: r.taxAmount,
      total: r.total,
      product: r.prod_id ? { id: r.prod_id, name: r.prod_name, sku: r.prod_sku } : null,
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
      const discountPct = Number(item.discountPct ?? 0);
      if (hasDiscount) {
        await prisma.$executeRaw`
          INSERT INTO "orden_pedido_items"
            (id, "ordenPedidoId", "productId", description, quantity, "unitPrice", "discountPct", "taxRate", subtotal, "taxAmount", total)
          VALUES
            (${itemId}, ${ordenPedidoId}, ${productId}, ${item.description},
             ${Number(item.quantity)}, ${Number(item.unitPrice)}, ${discountPct},
             ${Number(item.taxRate)}, ${Number(item.subtotal)}, ${Number(item.taxAmount)}, ${Number(item.total)})
        `;
      } else {
        await prisma.$executeRaw`
          INSERT INTO "orden_pedido_items"
            (id, "ordenPedidoId", "productId", description, quantity, "unitPrice", "taxRate", subtotal, "taxAmount", total)
          VALUES
            (${itemId}, ${ordenPedidoId}, ${productId}, ${item.description},
             ${Number(item.quantity)}, ${Number(item.unitPrice)},
             ${Number(item.taxRate)}, ${Number(item.subtotal)}, ${Number(item.taxAmount)}, ${Number(item.total)})
        `;
      }
    }
  }

  async getNextNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await (prisma as any).ordenPedido.count({
      where: { number: { startsWith: `OP-${year}-` } },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `OP-${year}-${seq}`;
  }
}
