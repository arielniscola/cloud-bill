import { z } from 'zod';

export const createWarehouseSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  address: z.string().optional().nullable(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const updateWarehouseSchema = createWarehouseSchema.partial();

export type CreateWarehouseDTO = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseDTO = z.infer<typeof updateWarehouseSchema>;
