import { randomUUID } from 'crypto';
import prisma from '../prisma';
import { IChequeRepository, ChequeFilters } from '../../../domain/repositories/IChequeRepository';
import { Cheque, CreateChequeInput, ChequeStatus } from '../../../domain/entities/Cheque';

type RawCheque = {
  id:             string;
  number:         string;
  type:           string;
  checkNumber:    string | null;
  bank:           string | null;
  amount:         string | number;
  currency:       string;
  exchangeRate:   string | number;
  dueDate:        Date | null;
  issuer:         string | null;
  beneficiary:    string | null;
  status:         string;
  notes:          string | null;
  customerId:     string | null;
  supplierId:     string | null;
  bankAccountId:  string | null;
  cashRegisterId: string | null;
  userId:         string;
  companyId:      string;
  createdAt:      Date;
  updatedAt:      Date;
  customerName?:  string | null;
  supplierName?:  string | null;
};

function mapCheque(r: RawCheque): Cheque {
  return {
    id:             r.id,
    number:         r.number,
    type:           r.type as any,
    checkNumber:    r.checkNumber,
    bank:           r.bank,
    amount:         Number(r.amount),
    currency:       r.currency,
    exchangeRate:   Number(r.exchangeRate),
    dueDate:        r.dueDate,
    issuer:         r.issuer,
    beneficiary:    r.beneficiary,
    status:         r.status as ChequeStatus,
    notes:          r.notes,
    customerId:     r.customerId,
    supplierId:     r.supplierId,
    bankAccountId:  r.bankAccountId,
    cashRegisterId: r.cashRegisterId,
    userId:         r.userId,
    companyId:      r.companyId,
    createdAt:      r.createdAt,
    updatedAt:      r.updatedAt,
    customer:       r.customerId && r.customerName ? { id: r.customerId, name: r.customerName } : null,
    supplier:       r.supplierId && r.supplierName ? { id: r.supplierId, name: r.supplierName } : null,
  };
}

export class PrismaChequeRepository implements IChequeRepository {
  async nextNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "cheques"
      WHERE "companyId" = ${companyId}
        AND EXTRACT(YEAR FROM "createdAt") = ${year}
    `;
    const seq = Number(rows[0].count) + 1;
    return `CHQ-${year}-${String(seq).padStart(6, '0')}`;
  }

  async findAll(filters: ChequeFilters): Promise<{ data: Cheque[]; total: number }> {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;

    const conditions: string[] = [`c."companyId" = '${filters.companyId}'`];
    if (filters.type)       conditions.push(`c."type" = '${filters.type}'`);
    if (filters.status)     conditions.push(`c."status" = '${filters.status}'`);
    if (filters.customerId) conditions.push(`c."customerId" = '${filters.customerId}'`);
    if (filters.supplierId) conditions.push(`c."supplierId" = '${filters.supplierId}'`);

    const where = conditions.join(' AND ');

    const rows = await prisma.$queryRawUnsafe<RawCheque[]>(`
      SELECT c.*,
             cu.name AS "customerName",
             su.name AS "supplierName"
      FROM "cheques" c
      LEFT JOIN "customers" cu ON cu.id = c."customerId"
      LEFT JOIN "suppliers" su ON su.id = c."supplierId"
      WHERE ${where}
      ORDER BY c."createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count FROM "cheques" c WHERE ${where}
    `);

    return {
      data:  rows.map(mapCheque),
      total: Number(countRows[0].count),
    };
  }

  async findById(id: string, companyId: string): Promise<Cheque | null> {
    const rows = await prisma.$queryRaw<RawCheque[]>`
      SELECT c.*,
             cu.name AS "customerName",
             su.name AS "supplierName"
      FROM "cheques" c
      LEFT JOIN "customers" cu ON cu.id = c."customerId"
      LEFT JOIN "suppliers" su ON su.id = c."supplierId"
      WHERE c.id = ${id} AND c."companyId" = ${companyId}
    `;
    return rows.length > 0 ? mapCheque(rows[0]) : null;
  }

  async create(data: CreateChequeInput & { userId: string; companyId: string }): Promise<Cheque> {
    const id     = randomUUID();
    const number = await this.nextNumber(data.companyId);

    await prisma.$executeRaw`
      INSERT INTO "cheques" (
        "id", "number", "type", "checkNumber", "bank",
        "amount", "currency", "exchangeRate",
        "dueDate", "issuer", "beneficiary", "status",
        "notes", "customerId", "supplierId",
        "bankAccountId", "cashRegisterId",
        "userId", "companyId", "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${number}, ${data.type},
        ${data.checkNumber ?? null}, ${data.bank ?? null},
        ${data.amount}::decimal, ${data.currency ?? 'ARS'}, ${data.exchangeRate ?? 1}::decimal,
        ${data.dueDate ? new Date(data.dueDate) : null},
        ${data.issuer ?? null}, ${data.beneficiary ?? null}, 'PENDING',
        ${data.notes ?? null}, ${data.customerId ?? null}, ${data.supplierId ?? null},
        ${data.bankAccountId ?? null}, ${data.cashRegisterId ?? null},
        ${data.userId}, ${data.companyId}, NOW(), NOW()
      )
    `;

    const created = await this.findById(id, data.companyId);
    return created!;
  }

  async updateStatus(id: string, status: ChequeStatus, companyId: string): Promise<Cheque> {
    await prisma.$executeRaw`
      UPDATE "cheques"
      SET "status" = ${status}, "updatedAt" = NOW()
      WHERE id = ${id} AND "companyId" = ${companyId}
    `;
    const updated = await this.findById(id, companyId);
    if (!updated) throw new Error('Cheque no encontrado');
    return updated;
  }

  async delete(id: string, companyId: string): Promise<void> {
    await prisma.$executeRaw`
      DELETE FROM "cheques" WHERE id = ${id} AND "companyId" = ${companyId}
    `;
  }
}
