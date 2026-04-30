import { z } from 'zod';

export const PRODUCT_CUSTOM_FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT'] as const;

const keyRegex = /^[a-z][a-z0-9_]*$/;

export const createProductCustomFieldSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  key: z
    .string()
    .min(2, 'La clave debe tener al menos 2 caracteres')
    .max(40)
    .regex(keyRegex, 'La clave solo puede contener minúsculas, números y guion bajo, comenzando con letra'),
  type: z.enum(PRODUCT_CUSTOM_FIELD_TYPES).default('TEXT'),
  options: z.string().optional().nullable(),
  isRequired: z.boolean().default(false),
  order: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateProductCustomFieldSchema = createProductCustomFieldSchema.partial();

export type CreateProductCustomFieldDTO = z.infer<typeof createProductCustomFieldSchema>;
export type UpdateProductCustomFieldDTO = z.infer<typeof updateProductCustomFieldSchema>;
