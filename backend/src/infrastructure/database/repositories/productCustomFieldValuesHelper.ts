import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import {
  ProductCustomField,
  ProductCustomFieldType,
  ProductCustomFieldValue,
  ProductCustomFieldValueInput,
} from '../../../domain/entities/ProductCustomField';

type RawValueWithField = {
  id: string;
  productId: string;
  fieldId: string;
  value: string | null;
  createdAt: Date;
  updatedAt: Date;
  field_id: string;
  field_name: string;
  field_key: string;
  field_type: string;
  field_options: string | null;
  field_isRequired: boolean;
  field_order: number;
  field_isActive: boolean;
  field_companyId: string;
  field_createdAt: Date;
  field_updatedAt: Date;
};

function mapValue(r: RawValueWithField): ProductCustomFieldValue {
  const field: ProductCustomField = {
    id: r.field_id,
    name: r.field_name,
    key: r.field_key,
    type: r.field_type as ProductCustomFieldType,
    options: r.field_options,
    isRequired: r.field_isRequired,
    order: Number(r.field_order),
    isActive: r.field_isActive,
    companyId: r.field_companyId,
    createdAt: r.field_createdAt,
    updatedAt: r.field_updatedAt,
  };
  return {
    id: r.id,
    productId: r.productId,
    fieldId: r.fieldId,
    value: r.value,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    field,
  };
}

export async function getCustomFieldValuesForProducts(
  productIds: string[],
): Promise<Map<string, ProductCustomFieldValue[]>> {
  const map = new Map<string, ProductCustomFieldValue[]>();
  if (productIds.length === 0) return map;

  const rows = await prisma.$queryRaw<RawValueWithField[]>`
    SELECT v.id, v."productId", v."fieldId", v.value, v."createdAt", v."updatedAt",
           f.id            AS field_id,
           f.name          AS field_name,
           f.key           AS field_key,
           f.type          AS field_type,
           f.options       AS field_options,
           f."isRequired"  AS "field_isRequired",
           f."order"       AS field_order,
           f."isActive"    AS "field_isActive",
           f."companyId"   AS "field_companyId",
           f."createdAt"   AS "field_createdAt",
           f."updatedAt"   AS "field_updatedAt"
    FROM "product_custom_field_values" v
    INNER JOIN "product_custom_fields" f ON f.id = v."fieldId"
    WHERE v."productId" = ANY(${productIds}::text[])
    ORDER BY f."order" ASC, f."name" ASC
  `;
  for (const r of rows) {
    if (!map.has(r.productId)) map.set(r.productId, []);
    map.get(r.productId)!.push(mapValue(r));
  }
  return map;
}

export async function getCustomFieldValuesForProduct(
  productId: string,
): Promise<ProductCustomFieldValue[]> {
  const map = await getCustomFieldValuesForProducts([productId]);
  return map.get(productId) ?? [];
}

export async function upsertCustomFieldValues(
  productId: string,
  values: ProductCustomFieldValueInput[],
  companyId: string,
): Promise<void> {
  if (!values || values.length === 0) return;

  const fieldIds = values.map((v) => v.fieldId);
  const validFields = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "product_custom_fields"
    WHERE id = ANY(${fieldIds}::text[]) AND "companyId" = ${companyId}
  `;
  const validIds = new Set(validFields.map((f) => f.id));

  for (const v of values) {
    if (!validIds.has(v.fieldId)) continue;
    const value = v.value === '' ? null : v.value;

    if (value === null || value === undefined) {
      await prisma.$executeRaw`
        DELETE FROM "product_custom_field_values"
        WHERE "productId" = ${productId} AND "fieldId" = ${v.fieldId}
      `;
      continue;
    }

    const id = randomUUID();
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO "product_custom_field_values"
        (id, "productId", "fieldId", value, "createdAt", "updatedAt")
      VALUES (${id}, ${productId}, ${v.fieldId}, ${value}, ${now}, ${now})
      ON CONFLICT ("productId", "fieldId")
      DO UPDATE SET value = EXCLUDED.value, "updatedAt" = EXCLUDED."updatedAt"
    `;
  }
}
