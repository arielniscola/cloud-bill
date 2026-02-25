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

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<PurchaseWithItems | null> {
    return prisma.purchase.findUnique({ where: { id }, include: includeRelations }) as Promise<PurchaseWithItems | null>;
  }

  async findAllByPeriod(year: number, month: number): Promise<PurchaseWithItems[]> {
    const dateFrom = new Date(year, month - 1, 1);
    const dateTo = new Date(year, month, 0, 23, 59, 59, 999);

    return prisma.purchase.findMany({
      where: {
        date: { gte: dateFrom, lte: dateTo },
        status: { not: 'CANCELLED' },
      },
      include: includeRelations,
      orderBy: { date: 'asc' },
    }) as Promise<PurchaseWithItems[]>;
  }

  async create(data: CreatePurchaseInput): Promise<PurchaseWithItems> {
    const items = data.items.map((item) => {
      const subtotal = new Decimal(item.quantity).times(item.unitPrice);
      const taxAmount = subtotal.times(item.taxRate).dividedBy(100);
      const total = subtotal.plus(taxAmount);
      return {
        description: item.description,
        quantity: new Decimal(item.quantity),
        unitPrice: new Decimal(item.unitPrice),
        taxRate: new Decimal(item.taxRate),
        subtotal,
        taxAmount,
        total,
      };
    });

    const subtotal = items.reduce((acc, i) => acc.plus(i.subtotal), new Decimal(0));
    const taxAmount = items.reduce((acc, i) => acc.plus(i.taxAmount), new Decimal(0));
    const total = subtotal.plus(taxAmount);

    return prisma.purchase.create({
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
        items: { create: items },
      },
      include: includeRelations,
    }) as Promise<PurchaseWithItems>;
  }

  async update(id: string, data: UpdatePurchaseInput): Promise<Purchase> {
    return prisma.purchase.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await prisma.purchase.delete({ where: { id } });
  }
}
