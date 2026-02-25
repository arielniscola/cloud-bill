import { injectable } from 'tsyringe';
import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { IRemitoRepository, RemitoFilters } from '../../../domain/repositories/IRemitoRepository';
import {
  Remito,
  RemitoWithItems,
  RemitoItem,
  CreateRemitoInput,
} from '../../../domain/entities/Remito';
import { PaginationParams, PaginatedResult, RemitoStatus } from '../../../shared/types';
import prisma from '../prisma';

@injectable()
export class PrismaRemitoRepository implements IRemitoRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findById(id: string): Promise<RemitoWithItems | null> {
    return this.prisma.remito.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: true },
        },
        customer: true,
        user: true,
      },
    });
  }

  async findAll(
    pagination: PaginationParams = { page: 1, limit: 10 },
    filters: RemitoFilters = {}
  ): Promise<PaginatedResult<Remito>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.RemitoWhereInput = {};

    if (filters.customerId) {
      where.customerId = filters.customerId;
    }

    if (filters.status) {
      where.status = filters.status;
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
      this.prisma.remito.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          customer: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.remito.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: CreateRemitoInput): Promise<RemitoWithItems> {
    const number = await this.getNextRemitoNumber();

    const status: RemitoStatus = data.stockBehavior === 'DISCOUNT' ? 'DELIVERED' : 'PENDING';

    return this.prisma.remito.create({
      data: {
        number,
        customerId: data.customerId,
        userId: data.userId,
        stockBehavior: data.stockBehavior,
        status,
        notes: data.notes,
        items: {
          create: data.items.map((item) => ({
            productId: item.productId,
            quantity: new Decimal(item.quantity),
            deliveredQuantity: data.stockBehavior === 'DISCOUNT'
              ? new Decimal(item.quantity)
              : new Decimal(0),
          })),
        },
      },
      include: {
        items: {
          include: { product: true },
        },
        customer: true,
        user: true,
      },
    });
  }

  async updateStatus(id: string, status: RemitoStatus): Promise<Remito> {
    return this.prisma.remito.update({
      where: { id },
      data: { status },
    });
  }

  async updateItemDeliveredQuantity(itemId: string, deliveredQuantity: number): Promise<RemitoItem> {
    return this.prisma.remitoItem.update({
      where: { id: itemId },
      data: { deliveredQuantity: new Decimal(deliveredQuantity) },
    });
  }

  async getNextRemitoNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `REM-${year}-`;

    const lastRemito = await this.prisma.remito.findFirst({
      where: {
        number: { startsWith: prefix },
      },
      orderBy: { number: 'desc' },
    });

    let nextNumber = 1;
    if (lastRemito) {
      const parts = lastRemito.number.split('-');
      const lastNumber = parseInt(parts[parts.length - 1], 10);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(8, '0')}`;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.remito.delete({ where: { id } });
  }
}
