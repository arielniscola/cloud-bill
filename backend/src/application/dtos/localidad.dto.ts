import { z } from 'zod';

const emptyToNull = (v: unknown) => (v === '' ? null : v);

export const createLocalidadSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es requerido').max(100),
  provinciaId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  postalCode: z.preprocess(emptyToNull, z.string().trim().max(10).nullable().optional()),
  isActive: z.boolean().default(true),
});

export const updateLocalidadSchema = createLocalidadSchema.partial();

export type CreateLocalidadDTO = z.infer<typeof createLocalidadSchema>;
export type UpdateLocalidadDTO = z.infer<typeof updateLocalidadSchema>;
