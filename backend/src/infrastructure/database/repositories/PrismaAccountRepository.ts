import { randomUUID } from 'crypto';
import prisma from '../prisma';
import { IAccountRepository } from '../../../domain/repositories/IAccountRepository';
import { Account, CreateAccountInput } from '../../../domain/entities/Accounting';

type RawAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
  parentCode: string | null;
  level: number;
  isAuxiliary: boolean;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
};

function mapAccount(r: RawAccount): Account {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type as Account['type'],
    parentCode: r.parentCode,
    level: Number(r.level),
    isAuxiliary: Boolean(r.isAuxiliary),
    isActive: Boolean(r.isActive),
    companyId: r.companyId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export class PrismaAccountRepository implements IAccountRepository {
  async findAll(companyId: string): Promise<Account[]> {
    const rows = await prisma.$queryRaw<RawAccount[]>`
      SELECT * FROM "accounts"
      WHERE "companyId" = ${companyId}
      ORDER BY "code" ASC
    `;
    return rows.map(mapAccount);
  }

  async findByCode(code: string, companyId: string): Promise<Account | null> {
    const rows = await prisma.$queryRaw<RawAccount[]>`
      SELECT * FROM "accounts"
      WHERE "code" = ${code} AND "companyId" = ${companyId}
      LIMIT 1
    `;
    return rows[0] ? mapAccount(rows[0]) : null;
  }

  async bulkCreate(accounts: CreateAccountInput[]): Promise<void> {
    for (const acc of accounts) {
      await prisma.$executeRaw`
        INSERT INTO "accounts" ("id","code","name","type","parentCode","level","isAuxiliary","isActive","companyId","createdAt","updatedAt")
        VALUES (
          ${randomUUID()}, ${acc.code}, ${acc.name}, ${acc.type},
          ${acc.parentCode ?? null}, ${acc.level}, ${acc.isAuxiliary ?? false},
          true, ${acc.companyId}, NOW(), NOW()
        )
        ON CONFLICT ("code","companyId") DO NOTHING
      `;
    }
  }

  async hasAccounts(companyId: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c FROM "accounts" WHERE "companyId" = ${companyId}
    `;
    return Number(rows[0]?.c ?? 0n) > 0;
  }
}
