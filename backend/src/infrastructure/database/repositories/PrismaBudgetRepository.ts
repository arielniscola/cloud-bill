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

  async findById(id: string): Promise<BudgetWithItems | null> {
    return prisma.budget.findUnique({
      where: { id },
      include: includeRelations,
    }) as Promise<BudgetWithItems | null>;
  }

  async create(data: CreateBudgetInput): Promise<BudgetWithItems> {
    const number = await this.getNextBudgetNumber();

    const items = data.items.map((item) => ({
      productId: item.productId ?? null,
      description: item.description,
      quantity: new Decimal(item.quantity),
      unitPrice: new Decimal(item.unitPrice),
      taxRate: new Decimal(item.taxRate),
      subtotal: new Decimal(item.subtotal),
      taxAmount: new Decimal(item.taxAmount),
      total: new Decimal(item.total),
    }));

    return prisma.budget.create({
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
        companyId: (data as any).companyId ?? (() => { throw new Error('companyId is required'); })(),
        subtotal: new Decimal(data.subtotal),
        taxAmount: new Decimal(data.taxAmount),
        total: new Decimal(data.total),
        items: { create: items },
      },
      include: includeRelations,
    }) as unknown as Promise<BudgetWithItems>;
  }

  async update(id: string, data: UpdateBudgetInput): Promise<BudgetWithItems> {
    const { items, ...rest } = data;

    if (items) {
      // Replace items: delete all and recreate
      await prisma.budgetItem.deleteMany({ where: { budgetId: id } });
      await prisma.budget.update({
        where: { id },
        data: {
          ...(rest as any),
          items: {
            create: items.map((item) => ({
              productId: item.productId ?? null,
              description: item.description,
              quantity: new Decimal(item.quantity),
              unitPrice: new Decimal(item.unitPrice),
              taxRate: new Decimal(item.taxRate),
              subtotal: new Decimal(item.subtotal),
              taxAmount: new Decimal(item.taxAmount),
              total: new Decimal(item.total),
            })),
          },
        },
      });
    } else {
      await prisma.budget.update({ where: { id }, data: rest as any });
    }

    return this.findById(id) as Promise<BudgetWithItems>;
  }

  async delete(id: string): Promise<void> {
    await prisma.budget.delete({ where: { id } });
  }

  async getNextBudgetNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await prisma.budget.count({
      where: {
        number: { startsWith: `PRES-${year}-` },
      },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `PRES-${year}-${seq}`;
  }
}
