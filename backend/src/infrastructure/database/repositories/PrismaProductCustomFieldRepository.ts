import { randomUUID } from 'crypto';
import { injectable } from 'tsyringe';
import { Prisma } from '@prisma/client';
import { IProductCustomFieldRepository } from '../../../domain/repositories/IProductCustomFieldRepository';
import {
  ProductCustomField,
  CreateProductCustomFieldInput,
  UpdateProductCustomFieldInput,
  ProductCustomFieldType,
} from '../../../domain/entities/ProductCustomField';
import prisma from '../prisma';

type RawField = {
  id: string;
  name: string;
  key: string;
  type: string;
  options: string | null;
  isRequired: boolean;
  order: number;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
};

function mapField(r: RawField): ProductCustomField {
  return {
    id: r.id,
    name: r.name,
    key: r.key,
    type: r.type as ProductCustomFieldType,
    options: r.options,
    isRequired: r.isRequired,
    order: Number(r.order),
    isActive: r.isActive,
    companyId: r.companyId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@injectable()
export class PrismaProductCustomFieldRepository implements IProductCustomFieldRepository {
  async findAll(companyId?: string, onlyActive = false): Promise<ProductCustomField[]> {
    const conditions: Prisma.Sql[] = [];
    if (companyId) conditions.push(Prisma.sql`"companyId" = ${companyId}`);
    if (onlyActive) conditions.push(Prisma.sql`"isActive" = true`);
    const where = conditions.length
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<RawField[]>`
      SELECT * FROM "product_custom_fields"
      ${where}
      ORDER BY "order" ASC, "name" ASC
    `;
    return rows.map(mapField);
  }

  async findById(id: string, companyId?: string): Promise<ProductCustomField | null> {
    const rows = companyId
      ? await prisma.$queryRaw<RawField[]>`
          SELECT * FROM "product_custom_fields" WHERE id = ${id} AND "companyId" = ${companyId} LIMIT 1
        `
      : await prisma.$queryRaw<RawField[]>`
          SELECT * FROM "product_custom_fields" WHERE id = ${id} LIMIT 1
        `;
    return rows[0] ? mapField(rows[0]) : null;
  }

  async findByKey(companyId: string, key: string): Promise<ProductCustomField | null> {
    const rows = await prisma.$queryRaw<RawField[]>`
      SELECT * FROM "product_custom_fields"
      WHERE "companyId" = ${companyId} AND "key" = ${key}
      LIMIT 1
    `;
    return rows[0] ? mapField(rows[0]) : null;
  }

  async create(data: CreateProductCustomFieldInput): Promise<ProductCustomField> {
    const id = randomUUID();
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO "product_custom_fields"
        (id, name, key, type, options, "isRequired", "order", "isActive", "companyId", "createdAt", "updatedAt")
      VALUES (
        ${id}, ${data.name}, ${data.key}, ${data.type},
        ${data.options ?? null}, ${data.isRequired}, ${data.order}, ${data.isActive},
        ${data.companyId}, ${now}, ${now}
      )
    `;
    return (await this.findById(id))!;
  }

  async update(id: string, data: UpdateProductCustomFieldInput): Promise<ProductCustomField> {
    const setClauses: Prisma.Sql[] = [];
    if (data.name       !== undefined) setClauses.push(Prisma.sql`name = ${data.name}`);
    if (data.key        !== undefined) setClauses.push(Prisma.sql`key = ${data.key}`);
    if (data.type       !== undefined) setClauses.push(Prisma.sql`type = ${data.type}`);
    if (data.options    !== undefined) setClauses.push(Prisma.sql`options = ${data.options ?? null}`);
    if (data.isRequired !== undefined) setClauses.push(Prisma.sql`"isRequired" = ${data.isRequired}`);
    if (data.order      !== undefined) setClauses.push(Prisma.sql`"order" = ${data.order}`);
    if (data.isActive   !== undefined) setClauses.push(Prisma.sql`"isActive" = ${data.isActive}`);
    setClauses.push(Prisma.sql`"updatedAt" = NOW()`);

    await prisma.$executeRaw`
      UPDATE "product_custom_fields" SET ${Prisma.join(setClauses)} WHERE id = ${id}
    `;
    return (await this.findById(id))!;
  }

  async delete(id: string): Promise<void> {
    await prisma.$executeRaw`DELETE FROM "product_custom_fields" WHERE id = ${id}`;
  }
}
