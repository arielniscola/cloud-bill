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

// Retención configurada para el proveedor: se propone automáticamente al emitir
// una Orden de Pago, calculando `percentage` sobre la base elegida.
//   NETO  → subtotal sin IVA (Ganancias RG 830, IIBB, SUSS)
//   IVA   → el IVA facturado (retención de IVA RG 2854)
//   BRUTO → neto + IVA
export const retentionBaseSchema = z.enum(['NETO', 'IVA', 'BRUTO']);
export const retentionTypeSchema = z.enum(['IIBB', 'GANANCIAS', 'IVA', 'SUSS', 'OTHER']);

export const createSupplierRetentionSchema = z.object({
  type:         retentionTypeSchema.default('IIBB'),
  jurisdiction: z.string().optional().nullable(),
  base:         retentionBaseSchema.default('NETO'),
  percentage:   z.coerce.number().min(0, 'La alícuota no puede ser negativa').max(100, 'La alícuota no puede superar 100%'),
  // Códigos ARCA para exportar a SICORE (ver createSupplierRetentionSchema en el
  // reporte de retenciones). Solo dígitos; vacío = no exportable a SICORE.
  arcaImpuesto: z.string().regex(/^\d{1,4}$/, 'El código de impuesto son hasta 4 dígitos').or(z.literal('')).optional().nullable(),
  arcaRegimen:  z.string().regex(/^\d{1,3}$/, 'El código de régimen son hasta 3 dígitos').or(z.literal('')).optional().nullable(),
  isActive:     z.boolean().optional().default(true),
  notes:        z.string().optional().nullable(),
});

export const updateSupplierRetentionSchema = createSupplierRetentionSchema.partial();

export type CreateSupplierRetentionDTO = z.infer<typeof createSupplierRetentionSchema>;
export type UpdateSupplierRetentionDTO = z.infer<typeof updateSupplierRetentionSchema>;
