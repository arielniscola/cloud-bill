import { z } from 'zod';

// Texto opcional: '' y null significan "sin dato" y se guardan como NULL (un
// CUIT '' chocaría con el índice único por empresa).
const optionalText = (max: number) =>
  z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(max).nullable().optional());

// El body validado llega tal cual a Prisma: Zod descarta cualquier campo que no
// esté acá (companyId, relaciones anidadas, fechas…). Sin este schema en la
// ruta, un body crudo podía mover el proveedor de empresa o escribir relaciones.
export const createSupplierSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(200),
  cuit: optionalText(20),
  taxCondition: z
    .enum(['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA', 'EXENTO', 'CONSUMIDOR_FINAL'])
    .optional(),
  address: optionalText(300),
  city: optionalText(120),
  phone: optionalText(60),
  email: z.preprocess((v) => (v === '' ? null : v), z.string().trim().email('Email inválido').nullable().optional()),
  notes: optionalText(2000),
  isActive: z.boolean().optional(),
  // Retención automática legacy (las vigentes van por /suppliers/:id/retentions).
  retentionType: optionalText(30),
  retentionPercentage: z.coerce.number().min(0).max(100).nullable().optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export type CreateSupplierDTO = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierDTO = z.infer<typeof updateSupplierSchema>;

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
