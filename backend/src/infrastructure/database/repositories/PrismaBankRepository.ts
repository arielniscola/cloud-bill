import { injectable } from 'tsyringe';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { IBankRepository } from '../../../domain/repositories/IBankRepository';
import { BankAccount, BankMovement, CreateBankAccountInput, CreateBankMovementInput } from '../../../domain/entities/Bank';
import { PaginatedResult, PaginationParams } from '../../../shared/types';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import prisma from '../prisma';

@injectable()
export class PrismaBankRepository implements IBankRepository {

  async findAllAccounts(companyId: string): Promise<BankAccount[]> {
    return prisma.$queryRaw<BankAccount[]>`
      SELECT * FROM bank_accounts
      WHERE "companyId" = ${companyId}
      ORDER BY name ASC
    `;
  }

  // `companyId` es obligatorio: sin él, conocer el id alcanzaba para leer u
  // operar la cuenta bancaria de otra empresa.
  async findAccountById(id: string, companyId: string): Promise<BankAccount | null> {
    const rows = await prisma.$queryRaw<BankAccount[]>`
      SELECT * FROM bank_accounts WHERE id = ${id} AND "companyId" = ${companyId}
    `;
    return rows[0] ?? null;
  }

  async createAccount(data: CreateBankAccountInput): Promise<BankAccount> {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO bank_accounts (id, name, bank, "accountNumber", currency, "companyId", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid()::text,
        ${data.name}, ${data.bank}, ${data.accountNumber ?? null},
        ${data.currency ?? 'ARS'}, ${data.companyId},
        NOW(), NOW()
      )
      RETURNING id
    `;
    return this.findAccountById(rows[0].id, data.companyId) as Promise<BankAccount>;
  }

  async updateAccount(
    id: string,
    companyId: string,
    data: Partial<CreateBankAccountInput> & { isActive?: boolean }
  ): Promise<BankAccount> {
    const sets: string[] = ['"updatedAt" = NOW()'];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name          !== undefined) { sets.push(`name = $${idx++}`);             values.push(data.name); }
    if (data.bank          !== undefined) { sets.push(`bank = $${idx++}`);             values.push(data.bank); }
    if (data.accountNumber !== undefined) { sets.push(`"accountNumber" = $${idx++}`);  values.push(data.accountNumber); }
    if (data.isActive      !== undefined) { sets.push(`"isActive" = $${idx++}`);       values.push(data.isActive); }

    await prisma.$executeRawUnsafe(
      `UPDATE bank_accounts SET ${sets.join(', ')} WHERE id = $${idx} AND "companyId" = $${idx + 1}`,
      ...values, id, companyId
    );
    return this.findAccountById(id, companyId) as Promise<BankAccount>;
  }

  async deleteAccount(id: string, companyId: string): Promise<void> {
    // Una cuenta con movimientos no se borra: se perdería el historial. Para
    // dejar de usarla está desactivarla.
    const [used] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM bank_movements WHERE "bankAccountId" = ${id}
    `;
    if ((used?.n ?? 0) > 0) {
      throw new AppError('La cuenta tiene movimientos y no se puede eliminar. Desactivala para dejar de usarla.', 400);
    }
    await prisma.$executeRaw`DELETE FROM bank_accounts WHERE id = ${id} AND "companyId" = ${companyId}`;
  }

  async getMovements(bankAccountId: string, pagination: PaginationParams, fiscalMode?: string): Promise<PaginatedResult<BankMovement>> {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const fiscalCond = fiscalMode
      ? Prisma.sql`AND "fiscalMode" = ${fiscalMode}`
      : Prisma.empty;

    const [data, countRows] = await Promise.all([
      prisma.$queryRaw<BankMovement[]>`
        SELECT * FROM bank_movements
        WHERE "bankAccountId" = ${bankAccountId} ${fiscalCond}
        ORDER BY date DESC, "createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM bank_movements
        WHERE "bankAccountId" = ${bankAccountId} ${fiscalCond}
      `,
    ]);

    const total = Number(countRows[0].count);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async addMovement(data: CreateBankMovementInput): Promise<BankMovement> {
    const delta = data.type === 'CREDIT' ? data.amount : -data.amount;

    // Saldo y movimiento se confirman juntos: con dos sentencias sueltas, una
    // falla entre ambas dejaba un movimiento sin reflejo en el saldo. El saldo
    // va primero y filtra por empresa: si la cuenta no es de esta empresa no
    // toca ninguna fila y no se registra nada.
    return prisma.$transaction(async (tx) => {
      const touched = await tx.$executeRaw`
        UPDATE bank_accounts
        SET balance = balance + ${new Decimal(delta)}, "updatedAt" = NOW()
        WHERE id = ${data.bankAccountId} AND "companyId" = ${data.companyId}
      `;
      if (touched === 0) throw new NotFoundError('Cuenta bancaria');

      const rows = await tx.$queryRaw<BankMovement[]>`
        INSERT INTO bank_movements (
          id, "bankAccountId", type, amount, description, date,
          "reciboId", "ordenPagoId", "companyId", "fiscalMode", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid()::text,
          ${data.bankAccountId}, ${data.type}, ${new Decimal(data.amount)},
          ${data.description}, ${data.date ?? new Date()},
          ${data.reciboId ?? null}, ${data.ordenPagoId ?? null},
          ${data.companyId}, ${data.fiscalMode ?? 'FORMAL'}, NOW(), NOW()
        )
        RETURNING *
      `;
      return rows[0];
    });
  }
}
