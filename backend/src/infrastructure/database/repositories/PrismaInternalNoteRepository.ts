import { injectable } from 'tsyringe';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { IInternalNoteRepository, InternalNoteFilters } from '../../../domain/repositories/IInternalNoteRepository';
import { InternalNote, CreateInternalNoteInput } from '../../../domain/entities/InternalNote';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import { allocateDocumentNumber } from '../DocumentSequence';

const SELECT = `
  n.id, n.number, n.type, n."customerId", n."supplierId", n."userId", n."companyId",
  n.currency, n.amount, n.reason, n.notes, n.status, n."createdAt", n."updatedAt",
  c.name AS "customerName",
  s.name AS "supplierName",
  u.name AS "userName"
`;

const FROM = `
  FROM "internal_notes" n
  LEFT JOIN customers c ON c.id = n."customerId"
  LEFT JOIN suppliers s ON s.id = n."supplierId"
  LEFT JOIN users     u ON u.id = n."userId"
`;

function mapRow(row: any): InternalNote {
  return {
    id:         row.id,
    number:     row.number,
    type:       row.type,
    customerId: row.customerId ?? null,
    supplierId: row.supplierId ?? null,
    userId:     row.userId,
    companyId:  row.companyId,
    currency:   row.currency,
    amount:     Number(row.amount),
    reason:     row.reason,
    notes:      row.notes ?? null,
    status:     row.status,
    createdAt:  row.createdAt,
    updatedAt:  row.updatedAt,
    customer:   row.customerName ? { id: row.customerId, name: row.customerName } : null,
    supplier:   row.supplierName ? { id: row.supplierId, name: row.supplierName } : null,
    user:       row.userName     ? { id: row.userId,     name: row.userName     } : undefined,
  };
}

@injectable()
export class PrismaInternalNoteRepository implements IInternalNoteRepository {

  async getNextNumber(companyId: string, tx?: Prisma.TransactionClient): Promise<string> {
    return allocateDocumentNumber('INTERNAL_NOTE', companyId, { tx });
  }

  async findById(id: string, companyId?: string): Promise<InternalNote | null> {
    const companyFilter = companyId
      ? Prisma.sql`AND n."companyId" = ${companyId}`
      : Prisma.empty;
    const [row] = await prisma.$queryRaw<any[]>`
      SELECT ${Prisma.raw(SELECT)}
      ${Prisma.raw(FROM)}
      WHERE n.id = ${id} ${companyFilter}
    `;
    return row ? mapRow(row) : null;
  }

  async findAll(
    pagination: PaginationParams,
    filters: InternalNoteFilters
  ): Promise<PaginatedResult<InternalNote>> {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const conditions: Prisma.Sql[] = [];
    if (filters.companyId)  conditions.push(Prisma.sql`n."companyId" = ${filters.companyId}`);
    if (filters.customerId) conditions.push(Prisma.sql`n."customerId" = ${filters.customerId}`);
    if (filters.supplierId) conditions.push(Prisma.sql`n."supplierId" = ${filters.supplierId}`);
    if (filters.entity === 'CUSTOMER') conditions.push(Prisma.sql`n."customerId" IS NOT NULL`);
    if (filters.entity === 'SUPPLIER') conditions.push(Prisma.sql`n."supplierId" IS NOT NULL`);
    if (filters.type)       conditions.push(Prisma.sql`n.type = ${filters.type}`);
    if (filters.status)     conditions.push(Prisma.sql`n.status = ${filters.status}`);
    if (filters.currency)   conditions.push(Prisma.sql`n.currency = ${filters.currency}`);
    if (filters.dateFrom)   conditions.push(Prisma.sql`n."createdAt" >= ${filters.dateFrom}`);
    if (filters.dateTo)     conditions.push(Prisma.sql`n."createdAt" <= ${filters.dateTo}`);

    const where = conditions.length
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT ${Prisma.raw(SELECT)}
        ${Prisma.raw(FROM)}
        ${where}
        ORDER BY n."createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::int AS count FROM "internal_notes" n ${where}
      `,
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    return {
      data: rows.map(mapRow),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: CreateInternalNoteInput): Promise<InternalNote> {
    const id     = randomUUID();
    const number = await this.getNextNumber(data.companyId);

    await prisma.$executeRaw`
      INSERT INTO "internal_notes"
        (id, number, type, "customerId", "supplierId", "userId", "companyId",
         currency, amount, reason, notes, status)
      VALUES
        (${id}, ${number}, ${data.type},
         ${data.customerId ?? null}, ${data.supplierId ?? null},
         ${data.userId}, ${data.companyId}, ${data.currency},
         ${data.amount}, ${data.reason}, ${data.notes ?? null}, 'ACTIVE')
    `;

    const note = await this.findById(id);
    return note!;
  }

  async cancel(id: string): Promise<InternalNote> {
    await prisma.$executeRaw`
      UPDATE "internal_notes" SET status = 'CANCELLED', "updatedAt" = NOW() WHERE id = ${id}
    `;
    const note = await this.findById(id);
    return note!;
  }
}
