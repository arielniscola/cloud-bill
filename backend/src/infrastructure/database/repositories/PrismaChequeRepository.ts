import { randomUUID } from 'crypto';
import { container } from 'tsyringe';
import prisma from '../prisma';
import { IChequeRepository, ChequeFilters } from '../../../domain/repositories/IChequeRepository';
import { Cheque, CreateChequeInput, ChequeStatus } from '../../../domain/entities/Cheque';
import { IChequeraRepository } from '../../../domain/repositories/IChequeraRepository';

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
  chequeraId:     string | null;
  ordenPagoId:    string | null;
  userId:         string;
  companyId:      string;
  fiscalMode:     string;
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
    chequeraId:     r.chequeraId ?? null,
    ordenPagoId:    r.ordenPagoId ?? null,
    userId:         r.userId,
    companyId:      r.companyId,
    fiscalMode:     r.fiscalMode ?? 'FORMAL',
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

    // Parametrized query — never interpolate filter values into SQL (SQL injection).
    const conditions: string[] = [`c."companyId" = $1`];
    const params: any[] = [filters.companyId];
    let i = 2;
    if (filters.type)       { conditions.push(`c."type" = $${i++}`);       params.push(filters.type); }
    if (filters.status)     { conditions.push(`c."status" = $${i++}`);     params.push(filters.status); }
    if (filters.customerId) { conditions.push(`c."customerId" = $${i++}`); params.push(filters.customerId); }
    if (filters.supplierId) { conditions.push(`c."supplierId" = $${i++}`); params.push(filters.supplierId); }
    if (filters.fiscalMode) { conditions.push(`c."fiscalMode" = $${i++}`); params.push(filters.fiscalMode); }

    const where = conditions.join(' AND ');

    const limitParam  = `$${i++}`;
    const offsetParam = `$${i++}`;
    const rows = await prisma.$queryRawUnsafe<RawCheque[]>(
      `SELECT c.*,
             cu.name AS "customerName",
             su.name AS "supplierName"
      FROM "cheques" c
      LEFT JOIN "customers" cu ON cu.id = c."customerId"
      LEFT JOIN "suppliers" su ON su.id = c."supplierId"
      WHERE ${where}
      ORDER BY c."createdAt" DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}`,
      ...params, limit, offset
    );

    const countRows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM "cheques" c WHERE ${where}`,
      ...params
    );

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

    // Si sale de una chequera: heredamos el banco y, si no se indicó N° de cheque,
    // tomamos el próximo número del talonario (y lo avanzamos).
    let checkNumber = data.checkNumber ?? null;
    let bank        = data.bank ?? null;
    if (data.chequeraId) {
      const chequeraRepo = container.resolve<IChequeraRepository>('ChequeraRepository');
      const chequera = await chequeraRepo.findById(data.chequeraId, data.companyId);
      if (chequera) {
        if (!bank) bank = chequera.bank;
        if (!checkNumber) {
          const used = await chequeraRepo.consumeNextNumber(data.chequeraId, data.companyId);
          if (used !== null) checkNumber = String(used);
        }
      }
    }

    await prisma.$executeRaw`
      INSERT INTO "cheques" (
        "id", "number", "type", "checkNumber", "bank",
        "amount", "currency", "exchangeRate",
        "dueDate", "issuer", "beneficiary", "status",
        "notes", "customerId", "supplierId",
        "bankAccountId", "cashRegisterId", "chequeraId", "ordenPagoId",
        "userId", "companyId", "fiscalMode", "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${number}, ${data.type},
        ${checkNumber}, ${bank},
        ${data.amount}::decimal, ${data.currency ?? 'ARS'}, ${data.exchangeRate ?? 1}::decimal,
        ${data.dueDate ? new Date(data.dueDate) : null},
        ${data.issuer ?? null}, ${data.beneficiary ?? null}, 'PENDING',
        ${data.notes ?? null}, ${data.customerId ?? null}, ${data.supplierId ?? null},
        ${data.bankAccountId ?? null}, ${data.cashRegisterId ?? null}, ${data.chequeraId ?? null}, ${data.ordenPagoId ?? null},
        ${data.userId}, ${data.companyId}, ${data.fiscalMode ?? 'FORMAL'}, NOW(), NOW()
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
