import { injectable } from 'tsyringe';
import { PrismaClient, Prisma } from '@prisma/client';
import { IProductRepository, ProductFilters } from '../../../domain/repositories/IProductRepository';
import { Product, CreateProductInput, UpdateProductInput } from '../../../domain/entities/Product';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

type RawSupplierInfo = { id: string; supplierId: string | null; supplierName: string | null };

@injectable()
export class PrismaProductRepository implements IProductRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  // supplierId no está en el cliente Prisma generado todavía (bloqueado por el
  // lock del engine en Windows con el server corriendo) — se lee/escribe/filtra
  // vía raw SQL, mismo patrón que retentionType en PrismaSupplierRepository.
  private async enrichSupplier<T extends { id: string }>(items: T[]): Promise<T[]> {
    if (items.length === 0) return items;
    const rows = await this.prisma.$queryRaw<RawSupplierInfo[]>`
      SELECT p.id, p."supplierId", s.name AS "supplierName"
      FROM products p
      LEFT JOIN suppliers s ON s.id = p."supplierId"
      WHERE p.id IN (${Prisma.join(items.map((i) => i.id))})
    `;
    const map = new Map(rows.map((r) => [r.id, r]));
    return items.map((item) => {
      const info = map.get(item.id);
      return {
        ...item,
        supplierId: info?.supplierId ?? null,
        supplier: info?.supplierId ? { id: info.supplierId, name: info.supplierName ?? '' } : undefined,
      };
    });
  }

  async findById(id: string, companyId?: string): Promise<Product | null> {
    const product = await this.prisma.product.findFirst({
      where: { id, ...(companyId ? { companyId } : {}) },
      include: { rubro: true, brand: true, category: true },
    } as any);
    if (!product) return null;
    const [enriched] = await this.enrichSupplier([product]);
    return enriched as Product;
  }

  async findBySku(sku: string, companyId: string): Promise<Product | null> {
    return this.prisma.product.findFirst({ where: { sku, companyId } });
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
        { barcode: { equals: filters.search } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.rubroId) {
      const children = await this.prisma.rubro.findMany({
        where: { parentId: filters.rubroId },
        select: { id: true },
      });
      const rubroIds = [filters.rubroId, ...children.map((c) => c.id)];
      (where as any).rubroId = { in: rubroIds };
    }

    if (filters.brandId) {
      where.brandId = filters.brandId;
    }

    if (filters.supplierId) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM products WHERE "supplierId" = ${filters.supplierId}
      `;
      (where as any).id = { in: rows.map((r) => r.id) };
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

    const [rawData, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: { rubro: true, brand: true, category: true } as any,
      }),
      this.prisma.product.count({ where }),
    ]);
    const data = await this.enrichSupplier(rawData);

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
        cost, price, "salePriceUSD", "taxRate", "trackStock", "isActive",
        "priceUpdatedAt", "rubroId", "brandId", "categoryId", "supplierId", "companyId",
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        ${d.sku}, ${d.name}, ${d.description ?? null}, ${d.barcode ?? null},
        ${d.unit ?? 'UN'}, ${d.internalNotes ?? null},
        ${d.cost}, ${d.price}, ${d.salePriceUSD ?? null}, ${d.taxRate ?? 21},
        ${d.trackStock ?? true}, ${d.isActive ?? true}, NOW(),
        ${d.rubroId ?? null}, ${d.brandId ?? null}, ${d.categoryId ?? null}, ${d.supplierId ?? null}, ${companyId},
        NOW(), NOW()
      )
      RETURNING id
    `;
    return this.findById(rows[0].id) as Promise<Product>;
  }

  // Compartido entre update() (un producto) y updateByFilter() (muchos a la vez).
  private buildSetClauses(d: Record<string, unknown>): { clauses: Prisma.Sql[]; priceChanged: boolean } {
    const priceChanged = d.price !== undefined || d.salePriceUSD !== undefined || d.cost !== undefined;
    const clauses: Prisma.Sql[] = [];

    if (d.sku           !== undefined) clauses.push(Prisma.sql`sku = ${d.sku}`);
    if (d.name          !== undefined) clauses.push(Prisma.sql`name = ${d.name}`);
    if (d.description   !== undefined) clauses.push(Prisma.sql`description = ${d.description}`);
    if (d.barcode       !== undefined) clauses.push(Prisma.sql`barcode = ${d.barcode}`);
    if (d.unit          !== undefined) clauses.push(Prisma.sql`unit = ${d.unit}`);
    if (d.internalNotes !== undefined) clauses.push(Prisma.sql`"internalNotes" = ${d.internalNotes}`);
    if (d.cost          !== undefined) clauses.push(Prisma.sql`cost = ${d.cost}`);
    if (d.price         !== undefined) clauses.push(Prisma.sql`price = ${d.price}`);
    if (d.salePriceUSD  !== undefined) clauses.push(Prisma.sql`"salePriceUSD" = ${d.salePriceUSD}`);
    if (d.taxRate       !== undefined) clauses.push(Prisma.sql`"taxRate" = ${d.taxRate}`);
    if (d.trackStock    !== undefined) clauses.push(Prisma.sql`"trackStock" = ${d.trackStock}`);
    if (d.isActive      !== undefined) clauses.push(Prisma.sql`"isActive" = ${d.isActive}`);
    if (d.leadTimeDays  !== undefined) clauses.push(Prisma.sql`"leadTimeDays" = ${d.leadTimeDays}`);
    if (d.rubroId       !== undefined) clauses.push(Prisma.sql`"rubroId" = ${d.rubroId}`);
    if (d.brandId       !== undefined) clauses.push(Prisma.sql`"brandId" = ${d.brandId}`);
    if (d.categoryId    !== undefined) clauses.push(Prisma.sql`"categoryId" = ${d.categoryId}`);
    if (d.supplierId    !== undefined) clauses.push(Prisma.sql`"supplierId" = ${d.supplierId}`);
    if (priceChanged)                  clauses.push(Prisma.sql`"priceUpdatedAt" = NOW()`);

    return { clauses, priceChanged };
  }

  async update(id: string, data: UpdateProductInput): Promise<Product> {
    const { clauses } = this.buildSetClauses(data as Record<string, unknown>);
    clauses.push(Prisma.sql`"updatedAt" = NOW()`);

    await this.prisma.$executeRaw`
      UPDATE products SET ${Prisma.join(clauses)} WHERE id = ${id}
    `;
    return this.findById(id) as Promise<Product>;
  }

  // Un único UPDATE con el mismo filtro que usa findAll (nunca trae los
  // productos a memoria) — escala sin importar cuántos matcheen.
  async updateByFilter(filters: ProductFilters, data: UpdateProductInput): Promise<number> {
    const { clauses } = this.buildSetClauses(data as Record<string, unknown>);
    if (clauses.length === 0) return 0;
    clauses.push(Prisma.sql`"updatedAt" = NOW()`);

    const whereConds: Prisma.Sql[] = [Prisma.sql`1=1`];
    if (filters.companyId) whereConds.push(Prisma.sql`"companyId" = ${filters.companyId}`);
    if (filters.supplierId) whereConds.push(Prisma.sql`"supplierId" = ${filters.supplierId}`);
    if (filters.brandId) whereConds.push(Prisma.sql`"brandId" = ${filters.brandId}`);
    if (filters.isActive !== undefined) whereConds.push(Prisma.sql`"isActive" = ${filters.isActive}`);
    if (filters.minPrice !== undefined) whereConds.push(Prisma.sql`price >= ${filters.minPrice}`);
    if (filters.maxPrice !== undefined) whereConds.push(Prisma.sql`price <= ${filters.maxPrice}`);
    if (filters.search) {
      const term = `%${filters.search}%`;
      whereConds.push(Prisma.sql`(name ILIKE ${term} OR sku ILIKE ${term} OR barcode = ${filters.search} OR description ILIKE ${term})`);
    }
    if (filters.rubroId) {
      const children = await this.prisma.rubro.findMany({
        where: { parentId: filters.rubroId },
        select: { id: true },
      });
      const rubroIds = [filters.rubroId, ...children.map((c) => c.id)];
      whereConds.push(Prisma.sql`"rubroId" IN (${Prisma.join(rubroIds)})`);
    }

    const affected = await this.prisma.$executeRaw`
      UPDATE products SET ${Prisma.join(clauses)} WHERE ${Prisma.join(whereConds, ' AND ')}
    `;
    return affected;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.product.delete({ where: { id } });
  }
}
