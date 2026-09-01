import { injectable } from 'tsyringe';
import { Prisma } from '@prisma/client';
import { ISupplierRepository, SupplierFilters } from '../../../domain/repositories/ISupplierRepository';
import {
  Supplier, CreateSupplierInput, UpdateSupplierInput,
  SupplierRetention, CreateSupplierRetentionInput, UpdateSupplierRetentionInput, RetentionBase,
} from '../../../domain/entities/Supplier';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

type RawRetention = { id: string; retentionType: string | null; retentionPercentage: any };

type RawSupplierRetention = {
  id: string; supplierId: string; companyId: string;
  type: string; jurisdiction: string | null; base: string;
  percentage: any; arcaImpuesto: string | null; arcaRegimen: string | null;
  isActive: boolean; notes: string | null;
  createdAt: Date; updatedAt: Date;
};

function mapRetention(r: RawSupplierRetention): SupplierRetention {
  return {
    ...r,
    base: r.base as RetentionBase,
    percentage: Number(r.percentage),
  };
}

@injectable()
export class PrismaSupplierRepository implements ISupplierRepository {
  // retentionType/retentionPercentage no están en el cliente Prisma generado —
  // se leen/escriben vía raw SQL (mismo patrón que saleCondition en Customer).
  private async getRetention(id: string): Promise<{ retentionType: string | null; retentionPercentage: number | null }> {
    const rows = await prisma.$queryRaw<RawRetention[]>(
      Prisma.sql`SELECT id, "retentionType", "retentionPercentage" FROM suppliers WHERE id = ${id}`
    );
    return {
      retentionType: rows[0]?.retentionType ?? null,
      retentionPercentage: rows[0]?.retentionPercentage != null ? Number(rows[0].retentionPercentage) : null,
    };
  }

  async findAll(
    pagination: PaginationParams = { page: 1, limit: 10 },
    filters: SupplierFilters = {}
  ): Promise<PaginatedResult<Supplier>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = {};

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { cuit: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.companyId) {
      (where as any).companyId = filters.companyId;
    }

    const [data, total] = await Promise.all([
      prisma.supplier.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      prisma.supplier.count({ where }),
    ]);

    const retMap = new Map<string, { retentionType: string | null; retentionPercentage: number | null }>();
    if (data.length > 0) {
      const rows = await prisma.$queryRaw<RawRetention[]>(
        Prisma.sql`SELECT id, "retentionType", "retentionPercentage" FROM suppliers WHERE id IN (${Prisma.join(data.map((s) => s.id))})`
      );
      for (const r of rows) {
        retMap.set(r.id, {
          retentionType: r.retentionType ?? null,
          retentionPercentage: r.retentionPercentage != null ? Number(r.retentionPercentage) : null,
        });
      }
    }

    return {
      data: data.map((s) => ({ ...s, ...(retMap.get(s.id) ?? { retentionType: null, retentionPercentage: null }) })) as Supplier[],
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string, companyId?: string): Promise<Supplier | null> {
    const supplier = await prisma.supplier.findFirst({ where: { id, ...(companyId ? ({ companyId } as any) : {}) } });
    if (!supplier) return null;
    const retention = await this.getRetention(id);
    return { ...supplier, ...retention } as Supplier;
  }

  async findByCuit(cuit: string, companyId?: string): Promise<Supplier | null> {
    const supplier = await prisma.supplier.findFirst({
      where: { cuit, ...(companyId ? ({ companyId } as any) : {}) },
    });
    if (!supplier) return null;
    const retention = await this.getRetention(supplier.id);
    return { ...supplier, ...retention } as Supplier;
  }

  async create(data: CreateSupplierInput): Promise<Supplier> {
    const { retentionType = null, retentionPercentage = null, ...rest } = data as any;
    const created = await prisma.supplier.create({
      data: {
        ...rest,
        companyId: (data as any).companyId ?? (() => { throw new Error('companyId is required'); })(),
      } as any,
    });
    await prisma.$executeRaw(
      Prisma.sql`UPDATE suppliers SET "retentionType" = ${retentionType}, "retentionPercentage" = ${retentionPercentage} WHERE id = ${created.id}`
    );
    return { ...created, retentionType, retentionPercentage } as Supplier;
  }

  async update(id: string, data: UpdateSupplierInput): Promise<Supplier> {
    const { retentionType, retentionPercentage, ...rest } = data as any;
    const updated = await prisma.supplier.update({ where: { id }, data: rest });
    if (retentionType !== undefined || retentionPercentage !== undefined) {
      const current = await this.getRetention(id);
      const nextType = retentionType !== undefined ? retentionType : current.retentionType;
      const nextPct  = retentionPercentage !== undefined ? retentionPercentage : current.retentionPercentage;
      await prisma.$executeRaw(
        Prisma.sql`UPDATE suppliers SET "retentionType" = ${nextType}, "retentionPercentage" = ${nextPct} WHERE id = ${id}`
      );
      return { ...updated, retentionType: nextType, retentionPercentage: nextPct } as Supplier;
    }
    const current = await this.getRetention(id);
    return { ...updated, ...current } as Supplier;
  }

  async delete(id: string): Promise<void> {
    await prisma.supplier.delete({ where: { id } });
  }

  // ── Retenciones configuradas por proveedor ──────────────────────────────
  // Tabla nueva: se accede vía raw SQL para no depender de que el cliente
  // Prisma esté regenerado (mismo patrón que orden_pago_ajustes).

  async findRetentions(supplierId: string, companyId?: string, onlyActive = false): Promise<SupplierRetention[]> {
    const conditions: Prisma.Sql[] = [Prisma.sql`"supplierId" = ${supplierId}`];
    if (companyId) conditions.push(Prisma.sql`"companyId" = ${companyId}`);
    if (onlyActive) conditions.push(Prisma.sql`"isActive" = true`);
    const rows = await prisma.$queryRaw<RawSupplierRetention[]>`
      SELECT * FROM "supplier_retentions"
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY "createdAt" ASC
    `;
    return rows.map(mapRetention);
  }

  async findRetentionById(id: string, companyId?: string): Promise<SupplierRetention | null> {
    const companyFilter = companyId ? Prisma.sql`AND "companyId" = ${companyId}` : Prisma.empty;
    const rows = await prisma.$queryRaw<RawSupplierRetention[]>`
      SELECT * FROM "supplier_retentions" WHERE id = ${id} ${companyFilter}
    `;
    return rows[0] ? mapRetention(rows[0]) : null;
  }

  async createRetention(data: CreateSupplierRetentionInput): Promise<SupplierRetention> {
    const [{ id }] = await prisma.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`;
    await prisma.$executeRaw`
      INSERT INTO "supplier_retentions"
        ("id", "supplierId", "companyId", "type", "jurisdiction", "base", "percentage",
         "arcaImpuesto", "arcaRegimen", "isActive", "notes", "createdAt", "updatedAt")
      VALUES
        (${id}, ${data.supplierId}, ${data.companyId}, ${data.type}, ${data.jurisdiction ?? null},
         ${data.base}, ${data.percentage}, ${data.arcaImpuesto || null}, ${data.arcaRegimen || null},
         ${data.isActive ?? true}, ${data.notes ?? null}, NOW(), NOW())
    `;
    return (await this.findRetentionById(id))!;
  }

  async updateRetention(id: string, data: UpdateSupplierRetentionInput): Promise<SupplierRetention> {
    const sets: Prisma.Sql[] = [];
    if (data.type         !== undefined) sets.push(Prisma.sql`"type" = ${data.type}`);
    if (data.jurisdiction !== undefined) sets.push(Prisma.sql`"jurisdiction" = ${data.jurisdiction}`);
    if (data.base         !== undefined) sets.push(Prisma.sql`"base" = ${data.base}`);
    if (data.percentage   !== undefined) sets.push(Prisma.sql`"percentage" = ${data.percentage}`);
    if (data.arcaImpuesto !== undefined) sets.push(Prisma.sql`"arcaImpuesto" = ${data.arcaImpuesto || null}`);
    if (data.arcaRegimen  !== undefined) sets.push(Prisma.sql`"arcaRegimen" = ${data.arcaRegimen || null}`);
    if (data.isActive     !== undefined) sets.push(Prisma.sql`"isActive" = ${data.isActive}`);
    if (data.notes        !== undefined) sets.push(Prisma.sql`"notes" = ${data.notes}`);
    sets.push(Prisma.sql`"updatedAt" = NOW()`);

    await prisma.$executeRaw`
      UPDATE "supplier_retentions" SET ${Prisma.join(sets, ', ')} WHERE id = ${id}
    `;
    return (await this.findRetentionById(id))!;
  }

  async deleteRetention(id: string): Promise<void> {
    await prisma.$executeRaw`DELETE FROM "supplier_retentions" WHERE id = ${id}`;
  }
}
