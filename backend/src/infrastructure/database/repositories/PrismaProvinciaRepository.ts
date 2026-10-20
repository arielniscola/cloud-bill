import { randomUUID } from 'crypto';
import prisma from '../prisma';
import { IProvinciaRepository } from '../../../domain/repositories/IProvinciaRepository';
import { Provincia, CreateProvinciaInput, UpdateProvinciaInput } from '../../../domain/entities/Provincia';
import { DEFAULT_PROVINCIAS } from '../../../shared/constants/provincias';

export class PrismaProvinciaRepository implements IProvinciaRepository {
  async findAll(companyId: string): Promise<Provincia[]> {
    const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM "provincias" WHERE "companyId" = ${companyId}
    `;
    if (count === 0) await this.seed(companyId);
    return prisma.$queryRaw<Provincia[]>`
      SELECT * FROM "provincias"
      WHERE "companyId" = ${companyId}
      ORDER BY "name" ASC
    `;
  }

  /** Carga las 24 jurisdicciones. ON CONFLICT: dos pedidos simultáneos no duplican. */
  private async seed(companyId: string): Promise<void> {
    const now = new Date();
    for (const p of DEFAULT_PROVINCIAS) {
      await prisma.$executeRaw`
        INSERT INTO "provincias" (id, name, "afipCode", "jurisdictionCode", "isActive", "companyId", "createdAt", "updatedAt")
        VALUES (${randomUUID()}, ${p.name}, ${p.afipCode}, ${p.jurisdictionCode}, true, ${companyId}, ${now}, ${now})
        ON CONFLICT DO NOTHING
      `;
    }
  }

  async findById(id: string, companyId?: string): Promise<Provincia | null> {
    const rows = companyId
      ? await prisma.$queryRaw<Provincia[]>`
          SELECT * FROM "provincias" WHERE id = ${id} AND "companyId" = ${companyId} LIMIT 1
        `
      : await prisma.$queryRaw<Provincia[]>`
          SELECT * FROM "provincias" WHERE id = ${id} LIMIT 1
        `;
    return rows[0] ?? null;
  }

  async create(data: CreateProvinciaInput): Promise<Provincia> {
    const id = randomUUID();
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO "provincias" (id, name, "afipCode", "jurisdictionCode", "isActive", "companyId", "createdAt", "updatedAt")
      VALUES (${id}, ${data.name}, ${data.afipCode ?? null}, ${data.jurisdictionCode ?? null}, ${data.isActive ?? true}, ${data.companyId}, ${now}, ${now})
    `;
    return (await this.findById(id))!;
  }

  async update(id: string, data: UpdateProvinciaInput): Promise<Provincia> {
    const parts: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined)     { parts.push(`name = $${parts.length + 1}`); values.push(data.name); }
    if ('afipCode' in data)          { parts.push(`"afipCode" = $${parts.length + 1}`); values.push(data.afipCode ?? null); }
    if ('jurisdictionCode' in data)  { parts.push(`"jurisdictionCode" = $${parts.length + 1}`); values.push(data.jurisdictionCode ?? null); }
    if (data.isActive !== undefined) { parts.push(`"isActive" = $${parts.length + 1}`); values.push(data.isActive); }

    if (parts.length > 0) {
      values.push(new Date(), id);
      await prisma.$executeRawUnsafe(
        `UPDATE "provincias" SET ${parts.join(', ')}, "updatedAt" = $${values.length - 1} WHERE id = $${values.length}`,
        ...values
      );
    }
    return (await this.findById(id))!;
  }

  async delete(id: string): Promise<void> {
    await prisma.$executeRaw`UPDATE "provincias" SET "isActive" = false, "updatedAt" = NOW() WHERE id = ${id}`;
  }
}
