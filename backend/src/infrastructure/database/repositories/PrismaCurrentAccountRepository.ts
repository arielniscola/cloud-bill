import { injectable } from 'tsyringe';
import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ICurrentAccountRepository, MovementFilters } from '../../../domain/repositories/ICurrentAccountRepository';
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

  async findAllByCustomerId(customerId: string, fiscalMode?: string): Promise<CurrentAccount[]> {
    return this.prisma.currentAccount.findMany({
      where: { customerId, ...(fiscalMode ? { fiscalMode } : {}) },
      include: { customer: true },
    });
  }

  async createForCustomer(customerId: string, currency: Currency, creditLimit?: number, fiscalMode?: string, tx?: Prisma.TransactionClient): Promise<CurrentAccount> {
    const fm = fiscalMode ?? 'FORMAL';
    return ((tx ?? this.prisma) as any).currentAccount.create({
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

  private async _addMovementWithTx(
    tx: Prisma.TransactionClient,
    data: CreateAccountMovementInput
  ): Promise<AccountMovement> {
    // FOR UPDATE, no un findUnique suelto: el saldo es un read-modify-write y
    // Postgres corre en Read Committed. Sin el lock, dos movimientos simultáneos
    // sobre la misma cuenta leen el mismo saldo y el segundo pisa al primero:
    // se pierde un movimiento del saldo y la columna `balance` del movimiento
    // (la foto histórica que muestra el extracto) queda mal.
    // El lock se libera al cerrar la transacción del llamador.
    const locked = await tx.$queryRaw<{ balance: Prisma.Decimal }[]>`
      SELECT balance FROM "current_accounts"
      WHERE id = ${data.currentAccountId}
      FOR UPDATE
    `;

    if (!locked[0]) {
      throw new Error('Current account not found');
    }

    const amount = new Decimal(data.amount);
    const previousBalance = new Decimal(locked[0].balance);
    const newBalance =
      data.type === 'DEBIT' ? previousBalance.plus(amount) : previousBalance.minus(amount);

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
  }

  async addMovement(data: CreateAccountMovementInput, tx?: Prisma.TransactionClient): Promise<AccountMovement> {
    // Con `tx` participa de la transacción del llamador (el balance y el
    // movimiento se confirman o revierten junto con el resto del flujo).
    if (tx) return this._addMovementWithTx(tx, data);
    return this.prisma.$transaction((t) => this._addMovementWithTx(t, data));
  }

  async getMovements(
    currentAccountId: string | string[],
    pagination: PaginationParams = { page: 1, limit: 10 },
    filters: MovementFilters = {}
  ): Promise<PaginatedResult<AccountMovement>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;
    // "Todos" (modo fiscal) trae varias cuentas (una por fiscalMode) — se
    // combinan los movimientos de todas en una sola lista ordenada.
    const ids = Array.isArray(currentAccountId) ? currentAccountId : [currentAccountId];
    const idsWhere = ids.length === 1 ? Prisma.sql`= ${ids[0]}` : Prisma.sql`IN (${Prisma.join(ids)})`;

    // Los filtros se arman una vez y se reutilizan para la página y el total,
    // así el paginador no cuenta filas que la lista no muestra.
    const conds: Prisma.Sql[] = [Prisma.sql`m."currentAccountId" ${idsWhere}`];
    if (filters.type) conds.push(Prisma.sql`m.type::text = ${filters.type}`);
    if (filters.startDate) conds.push(Prisma.sql`m."createdAt" >= ${new Date(filters.startDate)}`);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      conds.push(Prisma.sql`m."createdAt" <= ${end}`);
    }
    if (filters.search) {
      const like = `%${filters.search}%`;
      conds.push(Prisma.sql`(m.description ILIKE ${like} OR i.number ILIKE ${like} OR b.number ILIKE ${like})`);
    }
    if (filters.origin === 'INVOICE') {
      conds.push(Prisma.sql`(m."invoiceId" IS NOT NULL AND i.type::text LIKE 'FACTURA%')`);
    } else if (filters.origin === 'CREDIT_DEBIT_NOTE') {
      conds.push(Prisma.sql`(m."invoiceId" IS NOT NULL AND i.type::text LIKE 'NOTA_%')`);
    } else if (filters.origin === 'RECIBO') {
      conds.push(Prisma.sql`m."reciboId" IS NOT NULL`);
    } else if (filters.origin === 'INTERNAL_NOTE') {
      conds.push(Prisma.sql`m."internalNoteId" IS NOT NULL`);
    }
    const where = Prisma.join(conds, ' AND ');

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT
          m.id, m."currentAccountId", m.type, m.amount, m.balance,
          m.description, m."invoiceId", m."budgetId", m."internalNoteId",
          m."cashRegisterId", m."reciboId", m."createdAt",
          i.number  AS "invoiceNumber",  i.type AS "invoiceType", i."dueDate" AS "invoiceDueDate",
          b.number  AS "budgetNumber"
        FROM "account_movements" m
        LEFT JOIN invoices i ON i.id = m."invoiceId"
        LEFT JOIN budgets  b ON b.id = m."budgetId"
        WHERE ${where}
        ORDER BY m."createdAt" DESC
        LIMIT ${limit} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count
        FROM "account_movements" m
        LEFT JOIN invoices i ON i.id = m."invoiceId"
        LEFT JOIN budgets  b ON b.id = m."budgetId"
        WHERE ${where}
      `.then((r) => Number(r[0]?.count ?? 0)),
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
      invoice:  r.invoiceId ? { id: r.invoiceId, number: r.invoiceNumber, type: r.invoiceType, dueDate: r.invoiceDueDate ?? null } : null,
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
    const account = await this.prisma.currentAccount.findFirst({
      where: { customerId, currency },
    });

    return account ? account.balance.toNumber() : 0;
  }

  async findAllWithDebt(companyId?: string, fiscalMode?: string, includeCredit = false): Promise<CurrentAccount[]> {
    return this.prisma.currentAccount.findMany({
      where: {
        ...(includeCredit ? { NOT: { balance: 0 } } : { balance: { gt: 0 } }),
        ...(companyId ? { customer: { companyId } } : {}),
        ...(fiscalMode ? { fiscalMode } : {}),
      },
      include: { customer: true },
    });
  }
}
