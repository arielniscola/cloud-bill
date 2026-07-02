import { randomUUID } from 'crypto';
import prisma from '../prisma';
import {
  IJournalEntryRepository,
  JournalEntryFilters,
} from '../../../domain/repositories/IJournalEntryRepository';
import { JournalEntry, JournalEntryLine, CreateJournalEntryInput } from '../../../domain/entities/Accounting';

type RawEntry = {
  id: string;
  number: string;
  date: Date;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
  companyId: string;
  userId: string | null;
  createdAt: Date;
};

type RawLine = {
  id: string;
  journalEntryId: string;
  accountCode: string;
  accountId: string;
  description: string | null;
  debit: string | number;
  credit: string | number;
  accountName?: string;
  accountType?: string;
};

function mapLine(r: RawLine): JournalEntryLine {
  return {
    id: r.id,
    journalEntryId: r.journalEntryId,
    accountCode: r.accountCode,
    accountId: r.accountId,
    description: r.description,
    debit: Number(r.debit),
    credit: Number(r.credit),
    account: r.accountName ? {
      code: r.accountCode,
      name: r.accountName,
      type: r.accountType as any,
    } : undefined,
  };
}

function mapEntry(r: RawEntry, lines?: JournalEntryLine[]): JournalEntry {
  return {
    id: r.id,
    number: r.number,
    date: r.date,
    description: r.description,
    referenceType: r.referenceType as JournalEntry['referenceType'],
    referenceId: r.referenceId,
    companyId: r.companyId,
    userId: r.userId,
    createdAt: r.createdAt,
    lines,
  };
}

export class PrismaJournalEntryRepository implements IJournalEntryRepository {
  async create(data: CreateJournalEntryInput): Promise<JournalEntry> {
    const year = new Date().getFullYear();
    const prefix = `ASI-${year}-`;
    const countRows = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c FROM "journal_entries"
      WHERE "companyId" = ${data.companyId} AND number LIKE ${prefix + '%'}
    `;
    const n = Number(countRows[0]?.c ?? 0n) + 1;
    const number = `${prefix}${String(n).padStart(6, '0')}`;
    const entryId = randomUUID();
    const date = data.date ?? new Date();

    await prisma.$executeRaw`
      INSERT INTO "journal_entries" ("id","number","date","description","referenceType","referenceId","companyId","userId","createdAt")
      VALUES (
        ${entryId}, ${number}, ${date}, ${data.description},
        ${data.referenceType ?? null}, ${data.referenceId ?? null},
        ${data.companyId}, ${data.userId ?? null}, NOW()
      )
    `;

    const lineRecords: JournalEntryLine[] = [];
    for (const line of data.lines) {
      // Find account id
      const accRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "accounts"
        WHERE "code" = ${line.accountCode} AND "companyId" = ${data.companyId}
        LIMIT 1
      `;
      const accountId = accRows[0]?.id;
      if (!accountId) continue;

      const lineId = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO "journal_entry_lines" ("id","journalEntryId","accountCode","accountId","description","debit","credit")
        VALUES (${lineId}, ${entryId}, ${line.accountCode}, ${accountId}, ${line.description ?? null}, ${line.debit}, ${line.credit})
      `;
      lineRecords.push({
        id: lineId,
        journalEntryId: entryId,
        accountCode: line.accountCode,
        accountId,
        description: line.description ?? null,
        debit: line.debit,
        credit: line.credit,
      });
    }

    return {
      id: entryId,
      number,
      date,
      description: data.description,
      referenceType: data.referenceType ?? null,
      referenceId: data.referenceId ?? null,
      companyId: data.companyId,
      userId: data.userId ?? null,
      createdAt: new Date(),
      lines: lineRecords,
    };
  }

  async findAll(
    pagination: { page: number; limit: number },
    filters: JournalEntryFilters
  ): Promise<{ data: JournalEntry[]; total: number; page: number; limit: number }> {
    const { page, limit } = pagination;
    const offset = (page - 1) * limit;

    const conditions: string[] = [`je."companyId" = '${filters.companyId}'`];
    if (filters.referenceType) conditions.push(`je."referenceType" = '${filters.referenceType}'`);
    if (filters.referenceId)   conditions.push(`je."referenceId" = '${filters.referenceId}'`);
    if (filters.dateFrom)      conditions.push(`je."date" >= '${filters.dateFrom.toISOString()}'`);
    if (filters.dateTo)        conditions.push(`je."date" <= '${filters.dateTo.toISOString()}'`);

    const where = conditions.join(' AND ');

    const countRows = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
      `SELECT COUNT(*) AS c FROM "journal_entries" je WHERE ${where}`
    );
    const total = Number(countRows[0]?.c ?? 0n);

    const rows = await prisma.$queryRawUnsafe<RawEntry[]>(
      `SELECT je.* FROM "journal_entries" je WHERE ${where} ORDER BY je."date" DESC, je."number" DESC LIMIT ${limit} OFFSET ${offset}`
    );

    return { data: rows.map((r) => mapEntry(r)), total, page, limit };
  }

  async findById(id: string, companyId?: string): Promise<JournalEntry | null> {
    const rows = companyId
      ? await prisma.$queryRaw<RawEntry[]>`
          SELECT * FROM "journal_entries" WHERE id = ${id} AND "companyId" = ${companyId} LIMIT 1
        `
      : await prisma.$queryRaw<RawEntry[]>`
          SELECT * FROM "journal_entries" WHERE id = ${id} LIMIT 1
        `;
    if (!rows[0]) return null;

    const lineRows = await prisma.$queryRaw<RawLine[]>`
      SELECT jel.*, a."name" AS "accountName", a."type" AS "accountType"
      FROM "journal_entry_lines" jel
      JOIN "accounts" a ON a.id = jel."accountId"
      WHERE jel."journalEntryId" = ${id}
      ORDER BY jel."debit" DESC
    `;

    return mapEntry(rows[0], lineRows.map(mapLine));
  }

  async findByReference(referenceType: string, referenceId: string): Promise<JournalEntry[]> {
    const rows = await prisma.$queryRaw<RawEntry[]>`
      SELECT * FROM "journal_entries"
      WHERE "referenceType" = ${referenceType} AND "referenceId" = ${referenceId}
      ORDER BY "createdAt" ASC
    `;
    return rows.map((r) => mapEntry(r));
  }
}
