import { injectable } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import {
  CurrentAccount,
  AccountMovement,
  CreateAccountMovementInput,
} from '../../../domain/entities/CurrentAccount';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

@injectable()
export class PrismaCurrentAccountRepository implements ICurrentAccountRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findById(id: string): Promise<CurrentAccount | null> {
    return this.prisma.currentAccount.findUnique({
      where: { id },
      include: { customer: true },
    });
  }

  async findByCustomerId(customerId: string): Promise<CurrentAccount | null> {
    return this.prisma.currentAccount.findUnique({
      where: { customerId },
      include: { customer: true },
    });
  }

  async createForCustomer(customerId: string, creditLimit?: number): Promise<CurrentAccount> {
    return this.prisma.currentAccount.create({
      data: {
        customerId,
        creditLimit: creditLimit !== undefined ? new Decimal(creditLimit) : null,
      },
    });
  }

  async updateCreditLimit(id: string, creditLimit: number | null): Promise<CurrentAccount> {
    return this.prisma.currentAccount.update({
      where: { id },
      data: {
        creditLimit: creditLimit !== null ? new Decimal(creditLimit) : null,
      },
    });
  }

  async addMovement(data: CreateAccountMovementInput): Promise<AccountMovement> {
    return this.prisma.$transaction(async (tx) => {
      const currentAccount = await tx.currentAccount.findUnique({
        where: { id: data.currentAccountId },
      });

      if (!currentAccount) {
        throw new Error('Current account not found');
      }

      const amount = new Decimal(data.amount);
      let newBalance: Decimal;

      if (data.type === 'DEBIT') {
        newBalance = currentAccount.balance.plus(amount);
      } else {
        newBalance = currentAccount.balance.minus(amount);
      }

      await tx.currentAccount.update({
        where: { id: data.currentAccountId },
        data: { balance: newBalance },
      });

      return tx.accountMovement.create({
        data: {
          currentAccountId: data.currentAccountId,
          type: data.type,
          amount,
          balance: newBalance,
          description: data.description,
          invoiceId: data.invoiceId,
        },
      });
    });
  }

  async getMovements(
    currentAccountId: string,
    pagination: PaginationParams = { page: 1, limit: 10 }
  ): Promise<PaginatedResult<AccountMovement>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.accountMovement.findMany({
        where: { currentAccountId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { invoice: true },
      }),
      this.prisma.accountMovement.count({ where: { currentAccountId } }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getBalance(customerId: string): Promise<number> {
    const account = await this.prisma.currentAccount.findUnique({
      where: { customerId },
    });

    return account ? account.balance.toNumber() : 0;
  }
}
