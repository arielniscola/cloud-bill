import { injectable } from 'tsyringe';
import { Decimal } from '@prisma/client/runtime/library';
import { IReciboRepository, ReciboFilters, CheckFilters } from '../../../domain/repositories/IReciboRepository';
import { ReciboWithRelations, CreateReciboInput } from '../../../domain/entities/Recibo';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

const includeRelations = {
  customer: { select: { id: true, name: true } },
  invoice: { select: { id: true, number: true, type: true } },
  budget: { select: { id: true, number: true } },
  ordenPedido: { select: { id: true, number: true } },
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
    if (filters.ordenPedidoId) where.ordenPedidoId = filters.ordenPedidoId;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.status) where.status = filters.status;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
    // Workaround: Prisma client stale — companyId not yet in generated types for Recibo.
    // Filter via customer relation (semantically equivalent: recibo.customer.companyId === companyId).
    if (filters.companyId) where.customer = { companyId: filters.companyId };
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

    // Create without exchangeRate (stale Prisma client doesn't know the column yet)
    const recibo = await prisma.recibo.create({
      data: {
        number,
        invoiceId: data.invoiceId ?? null,
        budgetId: data.budgetId ?? null,
        ordenPedidoId: (data as any).ordenPedidoId ?? null,
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
        checkStatus: data.paymentMethod === 'CHECK' ? 'PENDING' : null,
      },
    });

    // Set exchangeRate + companyId via raw SQL (bypasses stale Prisma client types)
    const rate = new Decimal(data.exchangeRate ?? 1);
    const companyId = (data as any).companyId ?? '00000000-0000-0000-0000-000000000001';
    await prisma.$executeRaw`UPDATE "recibos" SET "exchangeRate" = ${rate}, "companyId" = ${companyId} WHERE id = ${recibo.id}`;

    // Return with relations
    return prisma.recibo.findUnique({
      where: { id: recibo.id },
      include: includeRelations,
    }) as unknown as Promise<ReciboWithRelations>;
  }

  async findChecks(
    pagination: PaginationParams = { page: 1, limit: 50 },
    filters: CheckFilters = {}
  ): Promise<PaginatedResult<ReciboWithRelations>> {
    const { page = 1, limit = 50 } = pagination;
    const skip = (page - 1) * limit;

    const where: any = { paymentMethod: 'CHECK', status: 'EMITTED' };
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.checkStatus !== undefined) where.checkStatus = filters.checkStatus;
    if (filters.dueDateFrom || filters.dueDateTo) {
      where.checkDueDate = {};
      if (filters.dueDateFrom) where.checkDueDate.gte = filters.dueDateFrom;
      if (filters.dueDateTo) where.checkDueDate.lte = filters.dueDateTo;
    }
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
        orderBy: { checkDueDate: 'asc' },
        include: includeRelations,
      }),
      prisma.recibo.count({ where }),
    ]);

    return { data: data as ReciboWithRelations[], total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateCheckStatus(id: string, checkStatus: string): Promise<ReciboWithRelations> {
    await prisma.$executeRaw`UPDATE "recibos" SET "checkStatus" = ${checkStatus} WHERE id = ${id}`;
    return prisma.recibo.findUnique({
      where: { id },
      include: includeRelations,
    }) as unknown as Promise<ReciboWithRelations>;
  }

  async cancel(id: string): Promise<ReciboWithRelations> {
    return (prisma.recibo as any).update({
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
