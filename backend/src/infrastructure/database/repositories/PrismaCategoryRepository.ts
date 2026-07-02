import { injectable } from 'tsyringe';
import { Prisma } from '@prisma/client';
import { ICategoryRepository } from '../../../domain/repositories/ICategoryRepository';
import { Category, CreateCategoryInput, UpdateCategoryInput } from '../../../domain/entities/Category';
import prisma from '../prisma';

// allowsVariants is read/written via raw SQL to bypass stale Prisma client.
async function readAllowsVariants(ids: string[]): Promise<Map<string, boolean>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRaw<Array<{ id: string; allowsVariants: boolean }>>(
    Prisma.sql`SELECT "id", "allowsVariants" FROM "categories" WHERE "id" IN (${Prisma.join(ids)})`
  );
  return new Map(rows.map((r) => [r.id, r.allowsVariants]));
}

@injectable()
export class PrismaCategoryRepository implements ICategoryRepository {
  async findAll(companyId?: string): Promise<Category[]> {
    const categories = await (prisma as any).category.findMany({
      where: companyId ? { companyId } : undefined,
      orderBy: { name: 'asc' },
    });
    const map = await readAllowsVariants(categories.map((r: Category) => r.id));
    return categories.map((r: Category) => ({ ...r, allowsVariants: map.get(r.id) ?? false }));
  }

  async findById(id: string, companyId?: string): Promise<Category | null> {
    const category = await (prisma as any).category.findFirst({
      where: { id, ...(companyId ? { companyId } : {}) },
    });
    if (!category) return null;
    const map = await readAllowsVariants([id]);
    return { ...category, allowsVariants: map.get(id) ?? false };
  }

  async create(data: CreateCategoryInput): Promise<Category> {
    const { allowsVariants, ...rest } = data as CreateCategoryInput & { allowsVariants?: boolean };
    const category = await (prisma as any).category.create({ data: rest });
    if (allowsVariants !== undefined) {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "categories" SET "allowsVariants" = ${allowsVariants} WHERE "id" = ${category.id}`
      );
    }
    return { ...category, allowsVariants: allowsVariants ?? false };
  }

  async update(id: string, data: UpdateCategoryInput): Promise<Category> {
    const { allowsVariants, ...rest } = data as UpdateCategoryInput & { allowsVariants?: boolean };
    const category = await (prisma as any).category.update({ where: { id }, data: rest });
    if (allowsVariants !== undefined) {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "categories" SET "allowsVariants" = ${allowsVariants} WHERE "id" = ${id}`
      );
    }
    const map = await readAllowsVariants([id]);
    return { ...category, allowsVariants: map.get(id) ?? false };
  }

  async delete(id: string): Promise<void> {
    await (prisma as any).category.delete({ where: { id } });
  }
}
