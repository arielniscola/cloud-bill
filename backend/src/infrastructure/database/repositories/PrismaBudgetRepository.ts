import { injectable } from 'tsyringe';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { IBudgetRepository, BudgetFilters } from '../../../domain/repositories/IBudgetRepository';
import {
  Budget,
  BudgetWithItems,
  CreateBudgetInput,
  UpdateBudgetInput,
} from '../../../domain/entities/Budget';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';
import { allocateDocumentNumber } from '../DocumentSequence';

const includeRelations = {
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
    },
  },
  customer: { select: { id: true, name: true, taxId: true, email: true, address: true } },
  user: { select: { id: true, name: true } },
  invoice: { select: { id: true, number: true, status: true } },
};

@injectable()
export class PrismaBudgetRepository implements IBudgetRepository {
  async findAll(
    pagination: PaginationParams = { page: 1, limit: 10 },
    filters: BudgetFilters = {}
  ): Promise<PaginatedResult<Budget>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.BudgetWhereInput = {};

    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.status) where.status = filters.status as any;
    if (filters.type) where.type = filters.type as any;
    if (filters.currency) where.currency = filters.currency as any;
    if (filters.companyId) (where as any).companyId = filters.companyId;
    if (filters.fiscalMode) (where as any).fiscalMode = filters.fiscalMode;

    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = filters.dateFrom;
      if (filters.dateTo) where.date.lte = filters.dateTo;
    }

    const [data, total] = await Promise.all([
      prisma.budget.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          customer: { select: { id: true, name: true, taxId: true } },
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.budget.count({ where }),
    ]);

    return { data: data as any, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string, companyId?: string): Promise<BudgetWithItems | null> {
    const budget = await prisma.budget.findFirst({
      where: { id, ...(companyId ? ({ companyId } as any) : {}) },
      include: includeRelations,
    });
    if (!budget) return null;
    await this._enrichItemsWithVariants((budget as any).items);
    return budget as unknown as BudgetWithItems;
  }

  /** Hydrate items with variantId + variant info via raw SQL (Prisma client may be stale) */
  private async _enrichItemsWithVariants(items: any[]): Promise<void> {
    if (!items || items.length === 0) return;
    const ids = items.map((i) => i.id);
    const rows = await prisma.$queryRaw<Array<{ id: string; variantId: string | null; v_id: string | null; v_name: string | null; v_sku: string | null; v_attributes: any }>>`
      SELECT bi.id, bi."variantId",
        v.id AS v_id, v.name AS v_name, v.sku AS v_sku, v.attributes AS v_attributes
      FROM "budget_items" bi
      LEFT JOIN "product_variants" v ON v.id = bi."variantId"
      WHERE bi.id = ANY(${ids}::text[])
    `;
    const map = new Map(rows.map((r) => [r.id, r]));
    for (const item of items) {
      const r = map.get(item.id);
      if (r) {
        item.variantId = r.variantId ?? null;
        item.variant = r.v_id ? { id: r.v_id, name: r.v_name, sku: r.v_sku, attributes: r.v_attributes ?? {} } : null;
      }
    }
  }

  async create(data: CreateBudgetInput): Promise<BudgetWithItems> {
    const companyId = (data as any).companyId ?? (() => { throw new Error('companyId is required'); })();
    const number = await this.getNextBudgetNumber(companyId);

    const itemsWithVariant = data.items.map((item) => ({
      productId: item.productId ?? null,
      variantId: (item as any).variantId ?? null,
      description: item.description,
      quantity: new Decimal(item.quantity),
      unitPrice: new Decimal(item.unitPrice),
      taxRate: new Decimal(item.taxRate),
      subtotal: new Decimal(item.subtotal),
      taxAmount: new Decimal(item.taxAmount),
      total: new Decimal(item.total),
    }));
    const itemsForPrisma = itemsWithVariant.map(({ variantId: _v, ...rest }) => rest);

    const created = await (prisma as any).budget.create({
      data: {
        number,
        type: data.type,
        customerId: data.customerId ?? null,
        userId: data.userId,
        validUntil: data.validUntil ?? null,
        currency: data.currency,
        exchangeRate: new Decimal(data.exchangeRate),
        notes: data.notes ?? null,
        paymentTerms: data.paymentTerms ?? null,
        saleCondition: data.saleCondition ?? 'CONTADO',
        stockBehavior: (data as any).stockBehavior ?? 'DISCOUNT',
        companyId,
        fiscalMode: (data as any).fiscalMode ?? 'FORMAL',
        subtotal: new Decimal(data.subtotal),
        taxAmount: new Decimal(data.taxAmount),
        total: new Decimal(data.total),
        items: { create: itemsForPrisma },
      },
      include: includeRelations,
    });

    // Backfill variantId via raw SQL
    const createdItems = (created.items ?? []) as Array<{ id: string }>;
    for (let i = 0; i < itemsWithVariant.length; i++) {
      const variantId = itemsWithVariant[i].variantId;
      if (variantId && createdItems[i]?.id) {
        await prisma.$executeRaw`UPDATE "budget_items" SET "variantId" = ${variantId} WHERE "id" = ${createdItems[i].id}`;
        (createdItems[i] as any).variantId = variantId;
      }
    }

    return created as BudgetWithItems;
  }

  async update(id: string, data: UpdateBudgetInput): Promise<BudgetWithItems> {
    const { items, ...rest } = data;

    if (items) {
      // Replace items: delete all and recreate
      await prisma.budgetItem.deleteMany({ where: { budgetId: id } });
      const variantIds = items.map((item) => (item as any).variantId ?? null);
      const itemsForCreate = items.map((item) => ({
        productId: item.productId ?? null,
        description: item.description,
        quantity: new Decimal(item.quantity),
        unitPrice: new Decimal(item.unitPrice),
        taxRate: new Decimal(item.taxRate),
        subtotal: new Decimal(item.subtotal),
        taxAmount: new Decimal(item.taxAmount),
        total: new Decimal(item.total),
      }));
      const updated = await (prisma as any).budget.update({
        where: { id },
        data: { ...(rest as any), items: { create: itemsForCreate } },
        include: includeRelations,
      });
      const createdItems = (updated.items ?? []) as Array<{ id: string }>;
      for (let i = 0; i < variantIds.length; i++) {
        if (variantIds[i] && createdItems[i]?.id) {
          await prisma.$executeRaw`UPDATE "budget_items" SET "variantId" = ${variantIds[i]} WHERE "id" = ${createdItems[i].id}`;
        }
      }
    } else {
      await prisma.budget.update({ where: { id }, data: rest as any });
    }

    return this.findById(id) as Promise<BudgetWithItems>;
  }

  async delete(id: string): Promise<void> {
    await prisma.budget.delete({ where: { id } });
  }

  async getNextBudgetNumber(companyId: string, tx?: Prisma.TransactionClient): Promise<string> {
    return allocateDocumentNumber('BUDGET', companyId, { tx });
  }
}
