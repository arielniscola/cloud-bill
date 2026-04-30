import { injectable } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import {
  CurrentAccount,
  AccountMovement,
  CreateAccountMovementInput,
} from '../../../domain/entities/CurrentAccount';
import { PaginationParams, PaginatedResult, Currency } from '../../../shared/types';
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

  async findByCustomerId(customerId: string, currency?: Currency, fiscalMode?: string): Promise<CurrentAccount | null> {
    const fm = fiscalMode ?? 'FORMAL';
    if (currency) {
      const rows = await this.prisma.$queryRaw<any[]>`
        SELECT ca.*, c.name as "customerName"
        FROM "current_accounts" ca
        LEFT JOIN "customers" c ON c.id = ca."customerId"
        WHERE ca."customerId" = ${customerId}
          AND ca.currency = ${currency}::"Currency"
          AND ca."fiscalMode" = ${fm}
        LIMIT 1
      `;
      return rows[0] ?? null;
    }
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT ca.*, c.name as "customerName"
      FROM "current_accounts" ca
      LEFT JOIN "customers" c ON c.id = ca."customerId"
      WHERE ca."customerId" = ${customerId} AND ca."fiscalMode" = ${fm}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async findAllByCustomerId(customerId: string): Promise<CurrentAccount[]> {
    return this.prisma.currentAccount.findMany({
      where: { customerId },
      include: { customer: true },
    });
  }

  async createForCustomer(customerId: string, currency: Currency, creditLimit?: number, fiscalMode?: string): Promise<CurrentAccount> {
    const fm = fiscalMode ?? 'FORMAL';
    return (this.prisma as any).currentAccount.create({
      data: {
        customerId,
        currency,
        creditLimit: creditLimit !== undefined ? new Decimal(creditLimit) : null,
        fiscalMode: fm,
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
          budgetId: data.budgetId,
          cashRegisterId: data.cashRegisterId,
        },
      } as any);
    });
  }

  async getMovements(
    currentAccountId: string,
    pagination: PaginationParams = { page: 1, limit: 10 }
  ): Promise<PaginatedResult<AccountMovement>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT
          m.id, m."currentAccountId", m.type, m.amount, m.balance,
          m.description, m."invoiceId", m."budgetId", m."internalNoteId",
          m."cashRegisterId", m."reciboId", m."createdAt",
          i.number  AS "invoiceNumber",  i.type AS "invoiceType",
          b.number  AS "budgetNumber"
        FROM "account_movements" m
        LEFT JOIN invoices i ON i.id = m."invoiceId"
        LEFT JOIN budgets  b ON b.id = m."budgetId"
        WHERE m."currentAccountId" = ${currentAccountId}
        ORDER BY m."createdAt" DESC
        LIMIT ${limit} OFFSET ${skip}
      `,
      this.prisma.accountMovement.count({ where: { currentAccountId } }),
    ]);

    const data = rows.map((r) => ({
      id:               r.id,
      currentAccountId: r.currentAccountId,
      type:             r.type,
      amount:           Number(r.amount),
      balance:          Number(r.balance),
      description:      r.description,
      invoiceId:        r.invoiceId   ?? null,
      budgetId:         r.budgetId    ?? null,
      internalNoteId:   r.internalNoteId ?? null,
      cashRegisterId:   r.cashRegisterId ?? null,
      reciboId:         r.reciboId    ?? null,
      createdAt:        r.createdAt,
      invoice:  r.invoiceId ? { id: r.invoiceId, number: r.invoiceNumber, type: r.invoiceType } : null,
      budget:   r.budgetId  ? { id: r.budgetId,  number: r.budgetNumber  }                     : null,
    }));

    return {
      data: data as any as AccountMovement[],
      total: Number(countRows),
      page,
      limit,
      totalPages: Math.ceil(Number(countRows) / limit),
    };
  }

  async getBalance(customerId: string, currency: Currency): Promise<number> {
    const account = await this.prisma.currentAccount.findUnique({
      where: { customerId_currency: { customerId, currency } },
    });

    return account ? account.balance.toNumber() : 0;
  }

  async findAllWithDebt(companyId?: string): Promise<CurrentAccount[]> {
    return this.prisma.currentAccount.findMany({
      where: {
        balance: { gt: 0 },
        ...(companyId ? { customer: { companyId } } : {}),
      },
      include: { customer: true },
    });
  }
}
