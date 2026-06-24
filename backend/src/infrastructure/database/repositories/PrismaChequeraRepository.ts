import { randomUUID } from 'crypto';
import prisma from '../prisma';
import { IChequeraRepository } from '../../../domain/repositories/IChequeraRepository';
import { Chequera, CreateChequeraInput, UpdateChequeraInput } from '../../../domain/entities/Chequera';

type RawChequera = {
  id: string;
  name: string | null;
  bank: string;
  accountNumber: string;
  numberFrom: number | null;
  numberTo: number | null;
  nextNumber: number | null;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
};

function map(r: RawChequera): Chequera {
  return {
    ...r,
    numberFrom: r.numberFrom === null ? null : Number(r.numberFrom),
    numberTo:   r.numberTo   === null ? null : Number(r.numberTo),
    nextNumber: r.nextNumber === null ? null : Number(r.nextNumber),
  };
}

export class PrismaChequeraRepository implements IChequeraRepository {
  async findAll(companyId: string): Promise<Chequera[]> {
    const rows = await prisma.$queryRaw<RawChequera[]>`
      SELECT * FROM "chequeras" WHERE "companyId" = ${companyId} ORDER BY "name" ASC, "bank" ASC
    `;
    return rows.map(map);
  }

  async findById(id: string, companyId: string): Promise<Chequera | null> {
    const rows = await prisma.$queryRaw<RawChequera[]>`
      SELECT * FROM "chequeras" WHERE id = ${id} AND "companyId" = ${companyId} LIMIT 1
    `;
    return rows[0] ? map(rows[0]) : null;
  }

  async create(data: CreateChequeraInput): Promise<Chequera> {
    const id = randomUUID();
    const now = new Date();
    // Si no se especifica nextNumber, arranca en numberFrom.
    const nextNumber = data.nextNumber ?? data.numberFrom ?? null;
    await prisma.$executeRaw`
      INSERT INTO "chequeras"
        (id, name, bank, "accountNumber", "numberFrom", "numberTo", "nextNumber", "isActive", "companyId", "createdAt", "updatedAt")
      VALUES
        (${id}, ${data.name ?? null}, ${data.bank}, ${data.accountNumber},
         ${data.numberFrom ?? null}, ${data.numberTo ?? null}, ${nextNumber},
         ${data.isActive ?? true}, ${data.companyId}, ${now}, ${now})
    `;
    return (await this.findById(id, data.companyId))!;
  }

  async update(id: string, companyId: string, data: UpdateChequeraInput): Promise<Chequera> {
    const parts: string[] = [];
    const values: any[] = [];
    const push = (col: string, val: any) => { parts.push(`${col} = $${parts.length + 1}`); values.push(val); };

    if (data.name          !== undefined) push('name', data.name ?? null);
    if (data.bank          !== undefined) push('bank', data.bank);
    if (data.accountNumber !== undefined) push('"accountNumber"', data.accountNumber);
    if (data.numberFrom    !== undefined) push('"numberFrom"', data.numberFrom ?? null);
    if (data.numberTo      !== undefined) push('"numberTo"', data.numberTo ?? null);
    if (data.nextNumber    !== undefined) push('"nextNumber"', data.nextNumber ?? null);
    if (data.isActive      !== undefined) push('"isActive"', data.isActive);

    if (parts.length > 0) {
      values.push(new Date(), id, companyId);
      await prisma.$executeRawUnsafe(
        `UPDATE "chequeras" SET ${parts.join(', ')}, "updatedAt" = $${values.length - 2}
         WHERE id = $${values.length - 1} AND "companyId" = $${values.length}`,
        ...values
      );
    }
    return (await this.findById(id, companyId))!;
  }

  async delete(id: string, companyId: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE "chequeras" SET "isActive" = false, "updatedAt" = NOW()
      WHERE id = ${id} AND "companyId" = ${companyId}
    `;
  }

  async consumeNextNumber(id: string, companyId: string): Promise<number | null> {
    // Advance the counter and return the value that was just used.
    const rows = await prisma.$queryRaw<{ used: number | null }[]>`
      UPDATE "chequeras"
      SET "nextNumber" = "nextNumber" + 1, "updatedAt" = NOW()
      WHERE id = ${id} AND "companyId" = ${companyId} AND "nextNumber" IS NOT NULL
      RETURNING ("nextNumber" - 1) AS used
    `;
    return rows[0] ? Number(rows[0].used) : null;
  }
}
