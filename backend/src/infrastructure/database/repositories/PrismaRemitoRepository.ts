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
        invoice: { select: { id: true, number: true, type: true } },
        budget: { select: { id: true, number: true } },
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

    if (filters.companyId) {
      (where as any).companyId = filters.companyId;
    }

    if (filters.ordenPedidoId) {
      // Raw SQL to filter by ordenPedidoId (bypasses stale Prisma client types),
      // then fetch full objects with Prisma to get customer/user relations
      const oid = filters.ordenPedidoId;
      const cid = filters.companyId ?? null;

      const [idRows, countResult] = await Promise.all([
        prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM remitos
          WHERE "ordenPedidoId" = ${oid}
            ${cid ? Prisma.sql`AND "companyId" = ${cid}` : Prisma.empty}
          ORDER BY date DESC
          LIMIT ${limit} OFFSET ${skip}
        `,
        prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::int AS count FROM remitos
          WHERE "ordenPedidoId" = ${oid}
            ${cid ? Prisma.sql`AND "companyId" = ${cid}` : Prisma.empty}
        `,
      ]);

      const total = Number(countResult[0]?.count ?? 0);
      const ids = idRows.map((r) => r.id);

      const data = ids.length > 0
        ? await (this.prisma as any).remito.findMany({
            where: { id: { in: ids } },
            orderBy: { date: 'desc' },
            include: {
              customer: true,
              user: { select: { id: true, name: true, email: true } },
            },
          })
        : [];

      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
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
      (this.prisma as any).remito.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          customer: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      (this.prisma as any).remito.count({ where }),
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

    // Auto-deliver only standalone DISCOUNT remitos (no linked source document).
    // Linked remitos (from OP / invoice / budget) must start as PENDING and be
    // confirmed manually via the deliver endpoint, regardless of stockBehavior.
    const isLinked = !!(data.invoiceId || data.budgetId || data.ordenPedidoId);
    const autoDeliver = !isLinked && data.stockBehavior === 'DISCOUNT';
    const status: RemitoStatus = autoDeliver ? 'DELIVERED' : 'PENDING';

    return (this.prisma as any).remito.create({
      data: {
        number,
        customerId: data.customerId,
        userId: data.userId,
        stockBehavior: data.stockBehavior,
        status,
        notes: data.notes,
        invoiceId: data.invoiceId ?? null,
        budgetId: data.budgetId ?? null,
        ordenPedidoId: data.ordenPedidoId ?? null,
        companyId: (data as any).companyId ?? (() => { throw new Error('companyId is required'); })(),
        items: {
          create: data.items.map((item) => ({
            productId: item.productId,
            quantity: new Decimal(item.quantity),
            deliveredQuantity: autoDeliver
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
        invoice: { select: { id: true, number: true, type: true } },
        budget: { select: { id: true, number: true } },
        ordenPedido: { select: { id: true, number: true } },
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
