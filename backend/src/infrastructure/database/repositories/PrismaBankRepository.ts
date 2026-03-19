import { injectable } from 'tsyringe';
import { Decimal } from '@prisma/client/runtime/library';
import { IBankRepository } from '../../../domain/repositories/IBankRepository';
import { BankAccount, BankMovement, CreateBankAccountInput, CreateBankMovementInput } from '../../../domain/entities/Bank';
import { PaginatedResult, PaginationParams } from '../../../shared/types';
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

  async findAccountById(id: string): Promise<BankAccount | null> {
    const rows = await prisma.$queryRaw<BankAccount[]>`
      SELECT * FROM bank_accounts WHERE id = ${id}
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
    return this.findAccountById(rows[0].id) as Promise<BankAccount>;
  }

  async updateAccount(id: string, data: Partial<CreateBankAccountInput> & { isActive?: boolean }): Promise<BankAccount> {
    const sets: string[] = ['"updatedAt" = NOW()'];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name          !== undefined) { sets.push(`name = $${idx++}`);             values.push(data.name); }
    if (data.bank          !== undefined) { sets.push(`bank = $${idx++}`);             values.push(data.bank); }
    if (data.accountNumber !== undefined) { sets.push(`"accountNumber" = $${idx++}`);  values.push(data.accountNumber); }
    if (data.isActive      !== undefined) { sets.push(`"isActive" = $${idx++}`);       values.push(data.isActive); }

    await prisma.$executeRawUnsafe(
      `UPDATE bank_accounts SET ${sets.join(', ')} WHERE id = $${idx}`,
      ...values, id
    );
    return this.findAccountById(id) as Promise<BankAccount>;
  }

  async deleteAccount(id: string): Promise<void> {
    await prisma.$executeRaw`DELETE FROM bank_accounts WHERE id = ${id}`;
  }

  async getMovements(bankAccountId: string, pagination: PaginationParams): Promise<PaginatedResult<BankMovement>> {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const [data, countRows] = await Promise.all([
      prisma.$queryRaw<BankMovement[]>`
        SELECT * FROM bank_movements
        WHERE "bankAccountId" = ${bankAccountId}
        ORDER BY date DESC, "createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM bank_movements WHERE "bankAccountId" = ${bankAccountId}
      `,
    ]);

    const total = Number(countRows[0].count);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async addMovement(data: CreateBankMovementInput): Promise<BankMovement> {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO bank_movements (
        id, "bankAccountId", type, amount, description, date,
        "reciboId", "ordenPagoId", "companyId", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${data.bankAccountId}, ${data.type}, ${new Decimal(data.amount)},
        ${data.description}, ${data.date ?? new Date()},
        ${data.reciboId ?? null}, ${data.ordenPagoId ?? null},
        ${data.companyId}, NOW(), NOW()
      )
      RETURNING id
    `;

    // Update account balance
    const delta = data.type === 'CREDIT' ? data.amount : -data.amount;
    await prisma.$executeRaw`
      UPDATE bank_accounts
      SET balance = balance + ${new Decimal(delta)}, "updatedAt" = NOW()
      WHERE id = ${data.bankAccountId}
    `;

    const movRows = await prisma.$queryRaw<BankMovement[]>`
      SELECT * FROM bank_movements WHERE id = ${rows[0].id}
    `;
    return movRows[0];
  }
}
