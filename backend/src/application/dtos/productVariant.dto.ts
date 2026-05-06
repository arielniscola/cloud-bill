import { z } from 'zod';

export const createProductVariantSchema = z.object({
  sku: z.string().min(1, 'SKU es requerido'),
  name: z.string().min(1, 'Nombre es requerido'),
  attributes: z.record(z.string(), z.string()).default({}),
  priceOverride: z.number().nullable().optional(),
  costOverride: z.number().nullable().optional(),
  barcode: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

export const updateProductVariantSchema = createProductVariantSchema.partial();

// Bulk: combinatoria de atributos -> generar variantes
// Ej: { skuPrefix: "REM-NEG", attributes: { talle: ["S","M","L"], color: ["negro"] } }
//     genera 3 variantes: REM-NEG-S, REM-NEG-M, REM-NEG-L
export const bulkCreateProductVariantSchema = z.object({
  skuPrefix: z.string().min(1, 'SKU prefix requerido'),
  attributeMatrix: z.record(z.string(), z.array(z.string()).min(1)),
  priceOverride: z.number().nullable().optional(),
  costOverride: z.number().nullable().optional(),
});

export type CreateProductVariantDTO = z.infer<typeof createProductVariantSchema>;
export type UpdateProductVariantDTO = z.infer<typeof updateProductVariantSchema>;
export type BulkCreateProductVariantDTO = z.infer<typeof bulkCreateProductVariantSchema>;
