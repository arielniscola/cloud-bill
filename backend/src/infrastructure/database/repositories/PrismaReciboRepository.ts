import { injectable } from 'tsyringe';
import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { IReciboRepository, ReciboFilters, CheckFilters } from '../../../domain/repositories/IReciboRepository';
import { ReciboWithRelations, CreateReciboInput } from '../../../domain/entities/Recibo';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';
import { allocateDocumentNumber } from '../DocumentSequence';

const includeRelations = {
  customer: { select: { id: true, name: true } },
  invoice: { select: { id: true, number: true, type: true } },
  budget: { select: { id: true, number: true } },
  ordenPedido: { select: { id: true, number: true } },
  cashRegister: { select: { id: true, name: true } },
  user: { select: { id: true, name: true } },
};

// Fetch card fields (not in stale Prisma client) for a list of recibo IDs
async function enrichWithCardData(recibos: any[]): Promise<void> {
  const ids = recibos.map((r) => r.id).filter(Boolean);
  if (ids.length === 0) return;

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    cardId: string | null;
    surchargePercent: any;
    surchargeAmount: any;
    cardName: string | null;
    cardType: string | null;
  }>>`
    SELECT r.id,
           r."cardId",
           r."surchargePercent",
           r."surchargeAmount",
           c.name AS "cardName",
           c.type AS "cardType"
    FROM "recibos" r
    LEFT JOIN "cards" c ON c.id = r."cardId"
    WHERE r.id = ANY(${ids}::text[])
  `;

  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const recibo of recibos) {
    const extra = byId.get(recibo.id);
    if (extra) {
      recibo.cardId = extra.cardId ?? null;
      recibo.surchargePercent = extra.surchargePercent != null ? new Decimal(extra.surchargePercent) : null;
      recibo.surchargeAmount = extra.surchargeAmount != null ? new Decimal(extra.surchargeAmount) : null;
      recibo.card = extra.cardId
        ? { id: extra.cardId, name: extra.cardName ?? '', type: extra.cardType ?? '' }
        : null;
    }
  }
}

@injectable()
export class PrismaReciboRepository implements IReciboRepository {
  async findById(id: string, companyId?: string): Promise<ReciboWithRelations | null> {
    const recibo = await prisma.recibo.findFirst({
      where: { id, ...(companyId ? ({ companyId } as any) : {}) },
      include: includeRelations,
    });
    if (!recibo) return null;
    await enrichWithCardData([recibo]);
    return recibo as unknown as ReciboWithRelations;
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
    if (filters.fiscalMode) where.fiscalMode = filters.fiscalMode;
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

    await enrichWithCardData(data);
    return { data: data as ReciboWithRelations[], total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(data: CreateReciboInput, tx?: Prisma.TransactionClient): Promise<ReciboWithRelations> {
    const client = tx ?? prisma;
    const companyId = (data as any).companyId ?? (() => { throw new Error('companyId is required'); })();
    const number = await this.getNextNumber(companyId, tx);

    // Create without exchangeRate (stale Prisma client doesn't know the column yet)
    const recibo = await client.recibo.create({
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

    // Set exchangeRate + companyId + card fields via raw SQL (bypasses stale Prisma client types)
    const rate = new Decimal(data.exchangeRate ?? 1);
    const cardId = (data as any).cardId ?? null;
    const surchargePercent = (data as any).surchargePercent != null ? new Decimal((data as any).surchargePercent) : null;
    const surchargeAmount = (data as any).surchargeAmount != null ? new Decimal((data as any).surchargeAmount) : null;
    const fiscalMode = (data as any).fiscalMode ?? 'FORMAL';
    await client.$executeRaw`
      UPDATE "recibos"
      SET "exchangeRate" = ${rate},
          "companyId" = ${companyId},
          "cardId" = ${cardId},
          "surchargePercent" = ${surchargePercent},
          "surchargeAmount" = ${surchargeAmount},
          "fiscalMode" = ${fiscalMode}
      WHERE id = ${recibo.id}
    `;

    // Return with relations
    return client.recibo.findUnique({
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
    if ((filters as any).companyId) where.customer = { companyId: (filters as any).companyId };
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

  async cancel(id: string, tx?: Prisma.TransactionClient): Promise<ReciboWithRelations> {
    return ((tx ?? prisma).recibo as any).update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: includeRelations,
    }) as Promise<ReciboWithRelations>;
  }

  async getNextNumber(companyId: string, tx?: Prisma.TransactionClient): Promise<string> {
    return allocateDocumentNumber('RECIBO', companyId, { tx });
  }
}
