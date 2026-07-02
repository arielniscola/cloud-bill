import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../prisma';
import { IProductVariantRepository } from '../../../domain/repositories/IProductVariantRepository';
import {
  ProductVariant,
  CreateProductVariantInput,
  UpdateProductVariantInput,
} from '../../../domain/entities/ProductVariant';

type RawVariant = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  attributes: any;
  priceOverride: string | number | null;
  costOverride: string | number | null;
  barcode: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
};

function mapRow(row: RawVariant): ProductVariant {
  return {
    ...row,
    attributes: (row.attributes ?? {}) as Record<string, string>,
    priceOverride: row.priceOverride !== null ? new Decimal(row.priceOverride) : null,
    costOverride: row.costOverride !== null ? new Decimal(row.costOverride) : null,
  };
}

function toDecimalOrNull(v: Decimal | number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return new Decimal(v as any).toString();
}

export class PrismaProductVariantRepository implements IProductVariantRepository {
  async findByProduct(productId: string): Promise<ProductVariant[]> {
    const rows = await prisma.$queryRaw<RawVariant[]>`
      SELECT * FROM "product_variants"
      WHERE "productId" = ${productId}
      ORDER BY "name" ASC
    `;
    return rows.map(mapRow);
  }

  async findById(id: string, companyId?: string): Promise<ProductVariant | null> {
    const rows = companyId
      ? await prisma.$queryRaw<RawVariant[]>`
          SELECT * FROM "product_variants" WHERE id = ${id} AND "companyId" = ${companyId} LIMIT 1
        `
      : await prisma.$queryRaw<RawVariant[]>`
          SELECT * FROM "product_variants" WHERE id = ${id} LIMIT 1
        `;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findBySku(sku: string, companyId: string): Promise<ProductVariant | null> {
    const rows = await prisma.$queryRaw<RawVariant[]>`
      SELECT * FROM "product_variants"
      WHERE "sku" = ${sku} AND "companyId" = ${companyId}
      LIMIT 1
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async create(data: CreateProductVariantInput): Promise<ProductVariant> {
    const id = randomUUID();
    const attrs = JSON.stringify(data.attributes ?? {});
    const priceOv = toDecimalOrNull(data.priceOverride ?? null);
    const costOv = toDecimalOrNull(data.costOverride ?? null);

    await prisma.$executeRaw`
      INSERT INTO "product_variants" (
        id, "productId", "sku", "name", "attributes",
        "priceOverride", "costOverride", "barcode", "isActive", "companyId",
        "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${data.productId}, ${data.sku}, ${data.name}, ${attrs}::jsonb,
        ${priceOv}::decimal, ${costOv}::decimal, ${data.barcode ?? null},
        ${data.isActive ?? true}, ${data.companyId},
        NOW(), NOW()
      )
    `;
    return (await this.findById(id))!;
  }

  async createMany(items: CreateProductVariantInput[]): Promise<ProductVariant[]> {
    const created: ProductVariant[] = [];
    for (const item of items) {
      created.push(await this.create(item));
    }
    return created;
  }

  async update(id: string, data: UpdateProductVariantInput): Promise<ProductVariant> {
    const setClauses: Prisma.Sql[] = [];

    if (data.sku !== undefined) setClauses.push(Prisma.sql`"sku" = ${data.sku}`);
    if (data.name !== undefined) setClauses.push(Prisma.sql`"name" = ${data.name}`);
    if (data.attributes !== undefined) {
      setClauses.push(Prisma.sql`"attributes" = ${JSON.stringify(data.attributes)}::jsonb`);
    }
    if (data.priceOverride !== undefined) {
      setClauses.push(Prisma.sql`"priceOverride" = ${toDecimalOrNull(data.priceOverride)}::decimal`);
    }
    if (data.costOverride !== undefined) {
      setClauses.push(Prisma.sql`"costOverride" = ${toDecimalOrNull(data.costOverride)}::decimal`);
    }
    if (data.barcode !== undefined) setClauses.push(Prisma.sql`"barcode" = ${data.barcode}`);
    if (data.isActive !== undefined) setClauses.push(Prisma.sql`"isActive" = ${data.isActive}`);

    setClauses.push(Prisma.sql`"updatedAt" = NOW()`);

    await prisma.$executeRaw`
      UPDATE "product_variants" SET ${Prisma.join(setClauses)} WHERE id = ${id}
    `;
    return (await this.findById(id))!;
  }

  async delete(id: string): Promise<void> {
    await prisma.$executeRaw`DELETE FROM "product_variants" WHERE id = ${id}`;
  }
}
