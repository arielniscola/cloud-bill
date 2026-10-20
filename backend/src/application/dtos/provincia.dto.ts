import { z } from 'zod';

export const createProvinciaSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es requerido'),
  afipCode: z.number().int().min(0).max(99).optional().nullable(),
  jurisdictionCode: z.string().trim().max(10).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateProvinciaSchema = createProvinciaSchema.partial();

export type CreateProvinciaDTO = z.infer<typeof createProvinciaSchema>;
export type UpdateProvinciaDTO = z.infer<typeof updateProvinciaSchema>;
