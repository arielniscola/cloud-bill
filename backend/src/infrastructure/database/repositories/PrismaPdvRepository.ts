import { randomUUID } from 'crypto';
import prisma from '../prisma';
import { IPdvRepository } from '../../../domain/repositories/IPdvRepository';
import { PuntoDeVenta, CreatePdvInput, UpdatePdvInput } from '../../../domain/entities/PuntoDeVenta';

function mapRow(row: any): PuntoDeVenta {
  return {
    id: row.id,
    number: Number(row.number),
    name: row.name,
    companyId: row.companyId,
    isActive: row.isActive,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    assignedUsers: row.assignedUsers ?? undefined,
  };
}

export class PrismaPdvRepository implements IPdvRepository {
  async findAll(companyId: string): Promise<PuntoDeVenta[]> {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT p.id, p.number, p.name, p."companyId", p."isActive", p."createdAt", p."updatedAt"
      FROM "puntos_de_venta" p
      WHERE p."companyId" = ${companyId}
      ORDER BY p.number ASC
    `;

    if (rows.length === 0) return [];

    // Load assigned users per PdV
    const pdvIds = rows.map((r: any) => r.id);
    const users = await prisma.$queryRaw<{ pdvId: string; id: string; name: string; username: string }[]>`
      SELECT "pdvId", id, name, username
      FROM "users"
      WHERE "pdvId" = ANY(${pdvIds}::text[])
    `;

    const usersByPdv: Record<string, { id: string; name: string; username: string }[]> = {};
    for (const u of users) {
      if (!usersByPdv[u.pdvId]) usersByPdv[u.pdvId] = [];
      usersByPdv[u.pdvId].push({ id: u.id, name: u.name, username: u.username });
    }

    return rows.map((r: any) => mapRow({ ...r, assignedUsers: usersByPdv[r.id] ?? [] }));
  }

  async findById(id: string, companyId?: string): Promise<PuntoDeVenta | null> {
    const rows = companyId
      ? await prisma.$queryRaw<any[]>`
          SELECT id, number, name, "companyId", "isActive", "createdAt", "updatedAt"
          FROM "puntos_de_venta"
          WHERE id = ${id} AND "companyId" = ${companyId}
          LIMIT 1
        `
      : await prisma.$queryRaw<any[]>`
          SELECT id, number, name, "companyId", "isActive", "createdAt", "updatedAt"
          FROM "puntos_de_venta"
          WHERE id = ${id}
          LIMIT 1
        `;
    if (!rows[0]) return null;

    const users = await prisma.$queryRaw<{ id: string; name: string; username: string }[]>`
      SELECT id, name, username FROM "users" WHERE "pdvId" = ${id}
    `;

    return mapRow({ ...rows[0], assignedUsers: users });
  }

  async findByNumber(number: number, companyId: string): Promise<PuntoDeVenta | null> {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, number, name, "companyId", "isActive", "createdAt", "updatedAt"
      FROM "puntos_de_venta"
      WHERE number = ${number} AND "companyId" = ${companyId}
      LIMIT 1
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async create(input: CreatePdvInput): Promise<PuntoDeVenta> {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "puntos_de_venta" (id, number, name, "companyId", "isActive", "createdAt", "updatedAt")
      VALUES (${id}, ${input.number}, ${input.name}, ${input.companyId}, true, NOW(), NOW())
    `;
    return (await this.findById(id))!;
  }

  async update(id: string, input: UpdatePdvInput): Promise<PuntoDeVenta> {
    const sets: string[] = [];
    const params: any[] = [];

    if (input.name !== undefined) {
      params.push(input.name);
      sets.push(`name = $${params.length}`);
    }
    if (input.isActive !== undefined) {
      params.push(input.isActive);
      sets.push(`"isActive" = $${params.length}`);
    }
    sets.push(`"updatedAt" = NOW()`);
    params.push(id);

    await prisma.$executeRawUnsafe(
      `UPDATE "puntos_de_venta" SET ${sets.join(', ')} WHERE id = $${params.length}`,
      ...params
    );

    return (await this.findById(id))!;
  }

  async assignToUser(userId: string, pdvId: string | null): Promise<void> {
    if (pdvId === null) {
      await prisma.$executeRaw`
        UPDATE "users" SET "pdvId" = NULL, "updatedAt" = NOW() WHERE id = ${userId}
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE "users" SET "pdvId" = ${pdvId}, "updatedAt" = NOW() WHERE id = ${userId}
      `;
    }
  }

  async getForUser(userId: string): Promise<PuntoDeVenta | null> {
    const rows = await prisma.$queryRaw<{ pdvId: string | null }[]>`
      SELECT "pdvId" FROM "users" WHERE id = ${userId} LIMIT 1
    `;
    const pdvId = rows[0]?.pdvId;
    if (!pdvId) return null;
    return this.findById(pdvId);
  }
}
