import { z } from 'zod';

export const createProductSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  cost: z.number().min(0, 'Cost must be positive'),
  price: z.number().min(0, 'Price must be positive'),
  taxRate: z.number().min(0).max(100).default(21),
  isActive: z.boolean().default(true),
});

export const updateProductSchema = createProductSchema.partial();

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

export const productQuerySchema = z.object({
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
  search: z.preprocess(emptyToUndefined, z.string().optional()),
  categoryId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  isActive: z.preprocess(emptyToUndefined, z.string().transform((v) => v === 'true').optional()),
  minPrice: z.preprocess(emptyToUndefined, z.string().transform(Number).optional()),
  maxPrice: z.preprocess(emptyToUndefined, z.string().transform(Number).optional()),
});

export type CreateProductDTO = z.infer<typeof createProductSchema>;
export type UpdateProductDTO = z.infer<typeof updateProductSchema>;
export type ProductQueryDTO = z.infer<typeof productQuerySchema>;
