import { injectable } from 'tsyringe';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { IPurchaseRepository, PurchaseFilters } from '../../../domain/repositories/IPurchaseRepository';
import {
  Purchase,
  PurchaseWithItems,
  CreatePurchaseInput,
  UpdatePurchaseInput,
} from '../../../domain/entities/Purchase';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

const includeRelations = {
  items: true,
  supplier: { select: { id: true, name: true, cuit: true } },
  user: { select: { id: true, name: true, email: true } },
};

@injectable()
export class PrismaPurchaseRepository implements IPurchaseRepository {
  async findAll(
    pagination: PaginationParams = { page: 1, limit: 10 },
    filters: PurchaseFilters = {}
  ): Promise<PaginatedResult<Purchase>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseWhereInput = {};

    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.status) where.status = filters.status;
    if (filters.companyId) (where as any).companyId = filters.companyId;
    if (filters.fiscalMode) (where as any).fiscalMode = filters.fiscalMode;

    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = filters.dateFrom;
      if (filters.dateTo) where.date.lte = filters.dateTo;
    }

    const [data, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          supplier: { select: { id: true, name: true, cuit: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.purchase.count({ where }),
    ]);

    return { data: data as unknown as Purchase[], total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string, companyId?: string): Promise<PurchaseWithItems | null> {
    const purchase = await prisma.purchase.findFirst({ where: { id, ...(companyId ? ({ companyId } as any) : {}) }, include: includeRelations }) as unknown as PurchaseWithItems | null;
    if (!purchase) return null;

    // originPurchaseId + origin reference + exchangeRate via raw SQL (stale Prisma client workaround)
    const rows = await prisma.$queryRaw<{ originPurchaseId: string | null; originNumber: string | null; originType: string | null; exchangeRate: any }[]>`
      SELECT p."originPurchaseId", p."exchangeRate",
             o.number AS "originNumber",
             o.type::text AS "originType"
      FROM "purchases" p
      LEFT JOIN "purchases" o ON o.id = p."originPurchaseId"
      WHERE p.id = ${id}
    `;
    const row = rows[0];
    purchase.originPurchaseId = row?.originPurchaseId ?? null;
    (purchase as any).exchangeRate = row?.exchangeRate ?? 1;
    purchase.originPurchase = row?.originPurchaseId
      ? { id: row.originPurchaseId, number: row.originNumber ?? '', type: (row.originType as any) ?? 'FACTURA_A' }
      : null;

    return purchase;
  }

  async findAllByPeriod(year: number, month: number, companyId?: string, fiscalMode?: string): Promise<PurchaseWithItems[]> {
    const dateFrom = new Date(year, month - 1, 1);
    const dateTo = new Date(year, month, 0, 23, 59, 59, 999);

    return prisma.purchase.findMany({
      where: {
        date: { gte: dateFrom, lte: dateTo },
        status: { not: 'CANCELLED' },
        ...(companyId ? { companyId } as any : {}),
        ...(fiscalMode ? { fiscalMode } as any : {}),
      },
      include: includeRelations,
      orderBy: { date: 'asc' },
    }) as unknown as Promise<PurchaseWithItems[]>;
  }

  async create(data: CreatePurchaseInput): Promise<PurchaseWithItems> {
    const itemsWithVariant = data.items.map((item) => {
      const subtotal = new Decimal(item.quantity).times(item.unitPrice);
      const taxAmount = subtotal.times(item.taxRate).dividedBy(100);
      const total = subtotal.plus(taxAmount);
      return {
        productId: item.productId ?? null,
        variantId: (item as any).variantId ?? null,
        description: item.description,
        quantity: new Decimal(item.quantity),
        unitPrice: new Decimal(item.unitPrice),
        taxRate: new Decimal(item.taxRate),
        subtotal,
        taxAmount,
        total,
      };
    });

    // Strip variantId before passing to Prisma (stale client doesn't know the column).
    const itemsForPrisma = itemsWithVariant.map(({ variantId: _v, ...rest }) => rest);

    const subtotal = itemsWithVariant.reduce((acc, i) => acc.plus(i.subtotal), new Decimal(0));
    const taxAmount = itemsWithVariant.reduce((acc, i) => acc.plus(i.taxAmount), new Decimal(0));
    const total = subtotal.plus(taxAmount);

    const created = await prisma.purchase.create({
      data: {
        type: data.type,
        number: data.number,
        supplierId: data.supplierId,
        userId: data.userId,
        date: data.date ?? new Date(),
        currency: data.currency ?? 'ARS',
        notes: data.notes,
        subtotal,
        taxAmount,
        total,
        companyId: (data as any).companyId ?? (() => { throw new Error('companyId is required'); })(),
        items: { create: itemsForPrisma },
      },
      include: includeRelations,
    }) as unknown as PurchaseWithItems;

    // Backfill variantId via raw SQL.
    // Items in `created.items` come back in insertion order; they're 1-to-1 with input.
    const createdItems = (created.items ?? []) as Array<{ id: string; productId?: string | null }>;
    for (let i = 0; i < itemsWithVariant.length; i++) {
      const variantId = itemsWithVariant[i].variantId;
      if (variantId && createdItems[i]?.id) {
        await prisma.$executeRaw`
          UPDATE "purchase_items" SET "variantId" = ${variantId} WHERE "id" = ${createdItems[i].id}
        `;
        // Mirror to in-memory object so PurchaseController can read it
        (createdItems[i] as any).variantId = variantId;
      }
    }

    return created;
  }

  async update(id: string, data: UpdatePurchaseInput): Promise<Purchase> {
    return prisma.purchase.update({ where: { id }, data }) as unknown as Purchase;
  }

  async delete(id: string): Promise<void> {
    await prisma.purchase.delete({ where: { id } });
  }
}
