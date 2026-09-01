import { z } from 'zod';
import { MODULE_KEYS } from '../../shared/constants/modules';

export const createCompanySchema = z.object({
  name:         z.string().min(1, 'El nombre es requerido'),
  cuit:         z.string().optional().nullable(),
  address:      z.string().optional().nullable(),
  city:         z.string().optional().nullable(),
  phone:        z.string().optional().nullable(),
  email:        z.string().email().optional().nullable(),
  taxCondition: z.enum(['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA', 'EXENTO']).default('RESPONSABLE_INSCRIPTO'),
  grossIncome:  z.string().optional().nullable(),
  logoUrl:      z.string().url().optional().nullable(),
});

export const updateCompanySchema = createCompanySchema.partial().extend({
  isActive: z.boolean().optional(),
});

// Se deriva de MODULE_KEYS: cuando el enum se escribía a mano quedó fuera
// 'variantes', y activar ese módulo desde la UI devolvía 400.
export const updateModulesSchema = z.object({
  enabledModules: z.array(z.enum(['ALL', ...MODULE_KEYS])).min(1),
});

export type CreateCompanyDTO = z.infer<typeof createCompanySchema>;
export type UpdateCompanyDTO = z.infer<typeof updateCompanySchema>;
export type UpdateModulesDTO = z.infer<typeof updateModulesSchema>;
