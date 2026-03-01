import { injectable } from 'tsyringe';
import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ICashRegisterRepository } from '../../../domain/repositories/ICashRegisterRepository';
import {
  CashRegister,
  CashRegisterClose,
  CashRegisterClosePreview,
  CashRegisterMovement,
  CreateCashRegisterInput,
  UpdateCashRegisterInput,
  CreateCashRegisterCloseInput,
} from '../../../domain/entities/CashRegister';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

@injectable()
export class PrismaCashRegisterRepository implements ICashRegisterRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findById(id: string): Promise<CashRegister | null> {
    return this.prisma.cashRegister.findUnique({ where: { id } });
  }

  async findAll(onlyActive = false): Promise<CashRegister[]> {
    return this.prisma.cashRegister.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async create(data: CreateCashRegisterInput): Promise<CashRegister> {
    return this.prisma.cashRegister.create({ data });
  }

  async update(id: string, data: UpdateCashRegisterInput): Promise<CashRegister> {
    return this.prisma.cashRegister.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.cashRegister.delete({ where: { id } });
  }

  async getMovements(
    cashRegisterId: string,
    filters: { type?: string; startDate?: string; endDate?: string },
    pagination: PaginationParams = { page: 1, limit: 20 }
  ): Promise<PaginatedResult<CashRegisterMovement>> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.AccountMovementWhereInput = { cashRegisterId };

    if (filters.type) {
      where.type = filters.type as any;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        (where.createdAt as Prisma.DateTimeFilter).gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        (where.createdAt as Prisma.DateTimeFilter).lte = endDate;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.accountMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          currentAccount: {
            include: { customer: { select: { id: true, name: true } } },
          },
          invoice: { select: { id: true, type: true, number: true } },
        },
      }),
      this.prisma.accountMovement.count({ where }),
    ]);

    return {
      data: data as unknown as CashRegisterMovement[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async buildClosePeriodWhere(cashRegisterId: string): Promise<{
    where: Prisma.AccountMovementWhereInput;
    fromDate: Date | null;
  }> {
    const lastClose = await (this.prisma as any).cashRegisterClose.findFirst({
      where: { cashRegisterId },
      orderBy: { closedAt: 'desc' },
    });

    const fromDate: Date | null = lastClose?.closedAt ?? null;
    const where: Prisma.AccountMovementWhereInput = {
      cashRegisterId,
      ...(fromDate && { createdAt: { gt: fromDate } }),
    };

    return { where, fromDate };
  }

  async getClosePreview(cashRegisterId: string): Promise<CashRegisterClosePreview> {
    const { where, fromDate } = await this.buildClosePeriodWhere(cashRegisterId);

    const movements = await this.prisma.accountMovement.findMany({
      where,
      select: { type: true, amount: true },
    });

    const totalIn = movements
      .filter((m) => m.type === 'CREDIT')
      .reduce((sum, m) => sum + m.amount.toNumber(), 0);

    const totalOut = movements
      .filter((m) => m.type === 'DEBIT')
      .reduce((sum, m) => sum + m.amount.toNumber(), 0);

    return {
      fromDate,
      movementsCount: movements.length,
      totalIn,
      totalOut,
      netTotal: totalIn - totalOut,
    };
  }

  async createClose(
    cashRegisterId: string,
    data: CreateCashRegisterCloseInput
  ): Promise<CashRegisterClose> {
    const { where, fromDate } = await this.buildClosePeriodWhere(cashRegisterId);

    const movements = await this.prisma.accountMovement.findMany({
      where,
      select: { type: true, amount: true },
    });

    const totalIn = movements
      .filter((m) => m.type === 'CREDIT')
      .reduce((sum, m) => sum + m.amount.toNumber(), 0);

    const totalOut = movements
      .filter((m) => m.type === 'DEBIT')
      .reduce((sum, m) => sum + m.amount.toNumber(), 0);

    const result = await (this.prisma as any).cashRegisterClose.create({
      data: {
        cashRegisterId,
        fromDate,
        totalIn: new Decimal(totalIn),
        totalOut: new Decimal(totalOut),
        netTotal: new Decimal(totalIn - totalOut),
        movementsCount: movements.length,
        notes: data.notes,
        userId: data.userId,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    return result as CashRegisterClose;
  }

  async getCloses(
    cashRegisterId: string,
    pagination: PaginationParams = { page: 1, limit: 20 }
  ): Promise<PaginatedResult<CashRegisterClose>> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      (this.prisma as any).cashRegisterClose.findMany({
        where: { cashRegisterId },
        skip,
        take: limit,
        orderBy: { closedAt: 'desc' },
        include: { user: { select: { id: true, name: true } } },
      }),
      (this.prisma as any).cashRegisterClose.count({ where: { cashRegisterId } }),
    ]);

    return {
      data: data as CashRegisterClose[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
