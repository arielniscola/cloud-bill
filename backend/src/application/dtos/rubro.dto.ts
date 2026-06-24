import { z } from 'zod';

export const createRubroSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  parentId: z.string().uuid().optional().nullable(),
});

export const updateRubroSchema = createRubroSchema.partial();

export type CreateRubroDTO = z.infer<typeof createRubroSchema>;
export type UpdateRubroDTO = z.infer<typeof updateRubroSchema>;
