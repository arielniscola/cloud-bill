import { z } from 'zod';

export const createSupplierSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  cuit: z.string().optional(),
  taxCondition: z
    .enum(['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA', 'EXENTO', 'CONSUMIDOR_FINAL'])
    .optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type CreateSupplierDTO = z.infer<typeof createSupplierSchema>;
