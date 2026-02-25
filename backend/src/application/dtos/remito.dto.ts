import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const remitoItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive('Quantity must be positive'),
});

export const createRemitoSchema = z.object({
  customerId: z.string().uuid(),
  stockBehavior: z.enum(['DISCOUNT', 'RESERVE']),
  notes: z.preprocess(emptyToUndefined, z.string().optional()),
  items: z.array(remitoItemSchema).min(1, 'At least one item is required'),
});

const deliverItemSchema = z.object({
  remitoItemId: z.string().uuid(),
  quantity: z.number().positive('Quantity must be positive'),
});

export const deliverRemitoSchema = z.object({
  items: z.array(deliverItemSchema).min(1, 'At least one item is required'),
});

export const remitoQuerySchema = z.object({
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
  customerId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  status: z.preprocess(
    emptyToUndefined,
    z.enum(['PENDING', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED']).optional()
  ),
});

export type CreateRemitoDTO = z.infer<typeof createRemitoSchema>;
export type DeliverRemitoDTO = z.infer<typeof deliverRemitoSchema>;
export type RemitoQueryDTO = z.infer<typeof remitoQuerySchema>;
