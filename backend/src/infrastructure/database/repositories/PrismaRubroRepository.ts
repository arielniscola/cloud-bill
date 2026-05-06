import { injectable } from 'tsyringe';
import { Prisma } from '@prisma/client';
import { IRubroRepository } from '../../../domain/repositories/IRubroRepository';
import { Rubro, CreateRubroInput, UpdateRubroInput } from '../../../domain/entities/Rubro';
import prisma from '../prisma';

// allowsVariants is read/written via raw SQL to bypass stale Prisma client.
async function readAllowsVariants(ids: string[]): Promise<Map<string, boolean>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRaw<Array<{ id: string; allowsVariants: boolean }>>(
    Prisma.sql`SELECT "id", "allowsVariants" FROM "rubros" WHERE "id" IN (${Prisma.join(ids)})`
  );
  return new Map(rows.map((r) => [r.id, r.allowsVariants]));
}

@injectable()
export class PrismaRubroRepository implements IRubroRepository {
  async findAll(companyId?: string): Promise<Rubro[]> {
    const rubros = await (prisma as any).rubro.findMany({
      where: companyId ? { companyId } : undefined,
      orderBy: { name: 'asc' },
    });
    const map = await readAllowsVariants(rubros.map((r: Rubro) => r.id));
    return rubros.map((r: Rubro) => ({ ...r, allowsVariants: map.get(r.id) ?? false }));
  }

  async findById(id: string): Promise<Rubro | null> {
    const rubro = await (prisma as any).rubro.findUnique({ where: { id } });
    if (!rubro) return null;
    const map = await readAllowsVariants([id]);
    return { ...rubro, allowsVariants: map.get(id) ?? false };
  }

  async create(data: CreateRubroInput): Promise<Rubro> {
    const { allowsVariants, ...rest } = data as CreateRubroInput & { allowsVariants?: boolean };
    const rubro = await (prisma as any).rubro.create({ data: rest });
    if (allowsVariants !== undefined) {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "rubros" SET "allowsVariants" = ${allowsVariants} WHERE "id" = ${rubro.id}`
      );
    }
    return { ...rubro, allowsVariants: allowsVariants ?? false };
  }

  async update(id: string, data: UpdateRubroInput): Promise<Rubro> {
    const { allowsVariants, ...rest } = data as UpdateRubroInput & { allowsVariants?: boolean };
    const rubro = await (prisma as any).rubro.update({ where: { id }, data: rest });
    if (allowsVariants !== undefined) {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "rubros" SET "allowsVariants" = ${allowsVariants} WHERE "id" = ${id}`
      );
    }
    const map = await readAllowsVariants([id]);
    return { ...rubro, allowsVariants: map.get(id) ?? false };
  }

  async delete(id: string): Promise<void> {
    await (prisma as any).rubro.delete({ where: { id } });
  }
}
