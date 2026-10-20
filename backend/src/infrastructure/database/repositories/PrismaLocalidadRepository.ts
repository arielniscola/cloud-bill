import { randomUUID } from 'crypto';
import prisma from '../prisma';
import { ILocalidadRepository } from '../../../domain/repositories/ILocalidadRepository';
import { Localidad, CreateLocalidadInput, UpdateLocalidadInput } from '../../../domain/entities/Localidad';

export class PrismaLocalidadRepository implements ILocalidadRepository {
  async findAll(companyId: string): Promise<Localidad[]> {
    return prisma.$queryRaw<Localidad[]>`
      SELECT l.*, p.name AS "provinciaName"
      FROM "localidades" l
      LEFT JOIN "provincias" p ON p.id = l."provinciaId"
      WHERE l."companyId" = ${companyId}
      ORDER BY l.name ASC, p.name ASC
    `;
  }

  async findById(id: string, companyId?: string): Promise<Localidad | null> {
    const rows = await prisma.$queryRaw<Localidad[]>`
      SELECT l.*, p.name AS "provinciaName"
      FROM "localidades" l
      LEFT JOIN "provincias" p ON p.id = l."provinciaId"
      WHERE l.id = ${id} AND (${companyId ?? null}::text IS NULL OR l."companyId" = ${companyId ?? null})
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async create(data: CreateLocalidadInput): Promise<Localidad> {
    const id = randomUUID();
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO "localidades" (id, name, "provinciaId", "postalCode", "isActive", "companyId", "createdAt", "updatedAt")
      VALUES (${id}, ${data.name}, ${data.provinciaId ?? null}, ${data.postalCode ?? null}, ${data.isActive ?? true}, ${data.companyId}, ${now}, ${now})
    `;
    return (await this.findById(id))!;
  }

  async update(id: string, data: UpdateLocalidadInput): Promise<Localidad> {
    const parts: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined)     { parts.push(`name = $${parts.length + 1}`); values.push(data.name); }
    if ('provinciaId' in data)       { parts.push(`"provinciaId" = $${parts.length + 1}`); values.push(data.provinciaId ?? null); }
    if ('postalCode' in data)        { parts.push(`"postalCode" = $${parts.length + 1}`); values.push(data.postalCode ?? null); }
    if (data.isActive !== undefined) { parts.push(`"isActive" = $${parts.length + 1}`); values.push(data.isActive); }

    if (parts.length > 0) {
      values.push(new Date(), id);
      await prisma.$executeRawUnsafe(
        `UPDATE "localidades" SET ${parts.join(', ')}, "updatedAt" = $${values.length - 1} WHERE id = $${values.length}`,
        ...values
      );
    }
    return (await this.findById(id))!;
  }

  async delete(id: string): Promise<void> {
    await prisma.$executeRaw`UPDATE "localidades" SET "isActive" = false, "updatedAt" = NOW() WHERE id = ${id}`;
  }

  async findUsedInParties(companyId: string): Promise<{ city: string; province: string | null; postalCode: string | null }[]> {
    // El C.P. más usado de cada (localidad, provincia); los proveedores no tienen provincia ni C.P.
    return prisma.$queryRaw`
      SELECT city, province, (ARRAY_AGG("postalCode" ORDER BY n DESC) FILTER (WHERE "postalCode" IS NOT NULL))[1] AS "postalCode"
      FROM (
        SELECT TRIM(city) AS city, NULLIF(TRIM(province), '') AS province, NULLIF(TRIM("postalCode"), '') AS "postalCode", COUNT(*) AS n
        FROM "customers"
        WHERE "companyId" = ${companyId} AND NULLIF(TRIM(city), '') IS NOT NULL
        GROUP BY 1, 2, 3
        UNION ALL
        SELECT TRIM(city), NULL, NULL, COUNT(*)
        FROM "suppliers"
        WHERE "companyId" = ${companyId} AND NULLIF(TRIM(city), '') IS NOT NULL
        GROUP BY 1
      ) t
      GROUP BY city, province
    `;
  }
}
