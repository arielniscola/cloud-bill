import { z } from 'zod';

export const createCompanySchema = z.object({
  name:         z.string().min(1, 'El nombre es requerido'),
  cuit:         z.string().optional().nullable(),
  address:      z.string().optional().nullable(),
  city:         z.string().optional().nullable(),
  phone:        z.string().optional().nullable(),
  email:        z.string().email().optional().nullable(),
  taxCondition: z.enum(['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA', 'EXENTO']).default('RESPONSABLE_INSCRIPTO'),
  logoUrl:      z.string().url().optional().nullable(),
});

export const updateCompanySchema = createCompanySchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const updateModulesSchema = z.object({
  enabledModules: z.array(z.enum(['ALL', 'ventas', 'catalogo', 'compras', 'finanzas'])).min(1),
});

export type CreateCompanyDTO = z.infer<typeof createCompanySchema>;
export type UpdateCompanyDTO = z.infer<typeof updateCompanySchema>;
export type UpdateModulesDTO = z.infer<typeof updateModulesSchema>;
