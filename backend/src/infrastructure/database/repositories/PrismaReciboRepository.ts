import { injectable } from 'tsyringe';
import { Decimal } from '@prisma/client/runtime/library';
import { IReciboRepository, ReciboFilters } from '../../../domain/repositories/IReciboRepository';
import { ReciboWithRelations, CreateReciboInput } from '../../../domain/entities/Recibo';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

const includeRelations = {
  customer: { select: { id: true, name: true } },
  invoice: { select: { id: true, number: true, type: true } },
  budget: { select: { id: true, number: true } },
  cashRegister: { select: { id: true, name: true } },
  user: { select: { id: true, name: true } },
};

@injectable()
export class PrismaReciboRepository implements IReciboRepository {
  async findById(id: string): Promise<ReciboWithRelations | null> {
    return prisma.recibo.findUnique({
      where: { id },
      include: includeRelations,
    }) as Promise<ReciboWithRelations | null>;
  }

  async findAll(
    pagination: PaginationParams = { page: 1, limit: 20 },
    filters: ReciboFilters = {}
  ): Promise<PaginatedResult<ReciboWithRelations>> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.invoiceId) where.invoiceId = filters.invoiceId;
    if (filters.budgetId) where.budgetId = filters.budgetId;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.status) where.status = filters.status;
    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = filters.dateFrom;
      if (filters.dateTo) where.date.lte = filters.dateTo;
    }

    const [data, total] = await Promise.all([
      prisma.recibo.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: includeRelations,
      }),
      prisma.recibo.count({ where }),
    ]);

    return { data: data as ReciboWithRelations[], total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(data: CreateReciboInput): Promise<ReciboWithRelations> {
    const number = await this.getNextNumber();

    return prisma.recibo.create({
      data: {
        number,
        invoiceId: data.invoiceId ?? null,
        budgetId: data.budgetId ?? null,
        customerId: data.customerId,
        userId: data.userId,
        cashRegisterId: data.cashRegisterId ?? null,
        amount: new Decimal(data.amount),
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        reference: data.reference ?? null,
        bank: data.bank ?? null,
        checkDueDate: data.checkDueDate ?? null,
        installments: data.installments ?? null,
        notes: data.notes ?? null,
      },
      include: includeRelations,
    }) as Promise<ReciboWithRelations>;
  }

  async cancel(id: string): Promise<ReciboWithRelations> {
    return prisma.recibo.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: includeRelations,
    }) as Promise<ReciboWithRelations>;
  }

  async getNextNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await prisma.recibo.count({
      where: { number: { startsWith: `REC-${year}-` } },
    });
    const seq = String(count + 1).padStart(8, '0');
    return `REC-${year}-${seq}`;
  }
}
