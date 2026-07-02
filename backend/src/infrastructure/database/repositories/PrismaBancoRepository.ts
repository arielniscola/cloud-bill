import { randomUUID } from 'crypto';
import prisma from '../prisma';
import { IBancoRepository } from '../../../domain/repositories/IBancoRepository';
import { Banco, CreateBancoInput, UpdateBancoInput } from '../../../domain/entities/Banco';

type RawBanco = {
  id: string;
  name: string;
  code: string | null;
  sucursal: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaBancoRepository implements IBancoRepository {
  async findAll(companyId: string): Promise<Banco[]> {
    return prisma.$queryRaw<RawBanco[]>`
      SELECT * FROM "bancos"
      WHERE "companyId" = ${companyId}
      ORDER BY "name" ASC
    `;
  }

  async findById(id: string, companyId?: string): Promise<Banco | null> {
    const rows = companyId
      ? await prisma.$queryRaw<RawBanco[]>`
          SELECT * FROM "bancos" WHERE id = ${id} AND "companyId" = ${companyId} LIMIT 1
        `
      : await prisma.$queryRaw<RawBanco[]>`
          SELECT * FROM "bancos" WHERE id = ${id} LIMIT 1
        `;
    return rows[0] ?? null;
  }

  async create(data: CreateBancoInput): Promise<Banco> {
    const id = randomUUID();
    const now = new Date();
    const code = data.code ?? null;
    const sucursal = data.sucursal ?? null;
    const isActive = data.isActive ?? true;

    await prisma.$executeRaw`
      INSERT INTO "bancos" (id, name, code, sucursal, "isActive", "companyId", "createdAt", "updatedAt")
      VALUES (${id}, ${data.name}, ${code}, ${sucursal}, ${isActive}, ${data.companyId}, ${now}, ${now})
    `;

    return (await this.findById(id))!;
  }

  async update(id: string, data: UpdateBancoInput): Promise<Banco> {
    const parts: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) { parts.push(`name = $${parts.length + 1}`); values.push(data.name); }
    if ('code' in data)         { parts.push(`code = $${parts.length + 1}`); values.push(data.code ?? null); }
    if ('sucursal' in data)     { parts.push(`sucursal = $${parts.length + 1}`); values.push(data.sucursal ?? null); }
    if (data.isActive !== undefined) { parts.push(`"isActive" = $${parts.length + 1}`); values.push(data.isActive); }

    if (parts.length > 0) {
      const setClause = parts.join(', ');
      values.push(new Date(), id);
      await prisma.$executeRawUnsafe(
        `UPDATE "bancos" SET ${setClause}, "updatedAt" = $${values.length - 1} WHERE id = $${values.length}`,
        ...values
      );
    }

    return (await this.findById(id))!;
  }

  async delete(id: string): Promise<void> {
    await prisma.$executeRaw`UPDATE "bancos" SET "isActive" = false, "updatedAt" = NOW() WHERE id = ${id}`;
  }
}
