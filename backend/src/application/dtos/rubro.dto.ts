import { z } from 'zod';

export const createRubroSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  allowsVariants: z.boolean().default(false),
});

export const updateRubroSchema = createRubroSchema.partial();

export type CreateRubroDTO = z.infer<typeof createRubroSchema>;
export type UpdateRubroDTO = z.infer<typeof updateRubroSchema>;
