import { z } from 'zod';

export const createBancoSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  code: z.string().optional().nullable(),
  sucursal: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateBancoSchema = createBancoSchema.partial();

export type CreateBancoDTO = z.infer<typeof createBancoSchema>;
export type UpdateBancoDTO = z.infer<typeof updateBancoSchema>;
