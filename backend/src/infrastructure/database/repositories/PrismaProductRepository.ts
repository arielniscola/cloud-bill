import { injectable } from 'tsyringe';
import { PrismaClient, Prisma } from '@prisma/client';
import { IProductRepository, ProductFilters } from '../../../domain/repositories/IProductRepository';
import { Product, CreateProductInput, UpdateProductInput } from '../../../domain/entities/Product';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

@injectable()
export class PrismaProductRepository implements IProductRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findById(id: string): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { id }, include: { category: true, brand: true } } as any);
  }

  async findBySku(sku: string): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { sku } });
  }

  async findAll(
    pagination: PaginationParams = { page: 1, limit: 10 },
    filters: ProductFilters = {}
  ): Promise<PaginatedResult<Product>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { sku: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.categoryId) {
      const children = await this.prisma.category.findMany({
        where: { parentId: filters.categoryId },
        select: { id: true },
      });
      const categoryIds = [filters.categoryId, ...children.map((c) => c.id)];
      (where as any).categoryId = { in: categoryIds };
    }

    if (filters.brandId) {
      where.brandId = filters.brandId;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      where.price = {};
      if (filters.minPrice !== undefined) {
        where.price.gte = filters.minPrice;
      }
      if (filters.maxPrice !== undefined) {
        where.price.lte = filters.maxPrice;
      }
    }

    if (filters.companyId) {
      (where as any).companyId = filters.companyId;
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: { category: true, brand: true },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: CreateProductInput): Promise<Product> {
    const d = data as any;
    const companyId = d.companyId ?? (() => { throw new Error('companyId is required'); })();
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO products (
        id, sku, name, description, barcode, unit, "internalNotes",
        cost, price, "salePriceUSD", "taxRate", "isActive",
        "priceUpdatedAt", "categoryId", "brandId", "companyId",
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        ${d.sku}, ${d.name}, ${d.description ?? null}, ${d.barcode ?? null},
        ${d.unit ?? 'UN'}, ${d.internalNotes ?? null},
        ${d.cost}, ${d.price}, ${d.salePriceUSD ?? null}, ${d.taxRate ?? 21},
        ${d.isActive ?? true}, NOW(),
        ${d.categoryId ?? null}, ${d.brandId ?? null}, ${companyId},
        NOW(), NOW()
      )
      RETURNING id
    `;
    return this.findById(rows[0].id) as Promise<Product>;
  }

  async update(id: string, data: UpdateProductInput): Promise<Product> {
    const d = data as any;
    const priceChanged = d.price !== undefined || d.salePriceUSD !== undefined || d.cost !== undefined;
    const setClauses: Prisma.Sql[] = [];

    if (d.sku           !== undefined) setClauses.push(Prisma.sql`sku = ${d.sku}`);
    if (d.name          !== undefined) setClauses.push(Prisma.sql`name = ${d.name}`);
    if (d.description   !== undefined) setClauses.push(Prisma.sql`description = ${d.description}`);
    if (d.barcode       !== undefined) setClauses.push(Prisma.sql`barcode = ${d.barcode}`);
    if (d.unit          !== undefined) setClauses.push(Prisma.sql`unit = ${d.unit}`);
    if (d.internalNotes !== undefined) setClauses.push(Prisma.sql`"internalNotes" = ${d.internalNotes}`);
    if (d.cost          !== undefined) setClauses.push(Prisma.sql`cost = ${d.cost}`);
    if (d.price         !== undefined) setClauses.push(Prisma.sql`price = ${d.price}`);
    if (d.salePriceUSD  !== undefined) setClauses.push(Prisma.sql`"salePriceUSD" = ${d.salePriceUSD}`);
    if (d.taxRate       !== undefined) setClauses.push(Prisma.sql`"taxRate" = ${d.taxRate}`);
    if (d.isActive      !== undefined) setClauses.push(Prisma.sql`"isActive" = ${d.isActive}`);
    if (d.leadTimeDays  !== undefined) setClauses.push(Prisma.sql`"leadTimeDays" = ${d.leadTimeDays}`);
    if (d.categoryId    !== undefined) setClauses.push(Prisma.sql`"categoryId" = ${d.categoryId}`);
    if (d.brandId       !== undefined) setClauses.push(Prisma.sql`"brandId" = ${d.brandId}`);
    if (priceChanged)                  setClauses.push(Prisma.sql`"priceUpdatedAt" = NOW()`);

    setClauses.push(Prisma.sql`"updatedAt" = NOW()`);

    await this.prisma.$executeRaw`
      UPDATE products SET ${Prisma.join(setClauses)} WHERE id = ${id}
    `;
    return this.findById(id) as Promise<Product>;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.product.delete({ where: { id } });
  }
}
