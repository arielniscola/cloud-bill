import { z } from 'zod';

const emptyToNull = (v: unknown) => (v === '' ? null : v);

export const createCashRegisterSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  description: z.preprocess(emptyToNull, z.string().nullable().optional()),
  isActive: z.boolean().default(true),
});

export const updateCashRegisterSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').optional(),
  description: z.preprocess(emptyToNull, z.string().nullable().optional()),
  isActive: z.boolean().optional(),
});

export const createCashRegisterCloseSchema = z.object({
  notes: z.string().optional(),
});

// Conceptos de movimiento manual de caja según el sentido. Los bancarios exigen
// cuenta: el depósito sale de la caja y entra al banco; la extracción al revés.
export const CASH_MOVEMENT_CONCEPTS = {
  OUT: ['RETIRO', 'DEPOSITO_BANCARIO', 'GASTO', 'OTRO'],
  IN: ['APORTE', 'FONDO_CAMBIO', 'EXTRACCION_BANCARIA', 'OTRO'],
} as const;
export const BANK_CASH_CONCEPTS = ['DEPOSITO_BANCARIO', 'EXTRACCION_BANCARIA'];

export const createCashMovementSchema = z.object({
  type: z.enum(['IN', 'OUT']),
  concept: z.enum(['RETIRO', 'DEPOSITO_BANCARIO', 'GASTO', 'APORTE', 'FONDO_CAMBIO', 'EXTRACCION_BANCARIA', 'OTRO']),
  amount: z.coerce.number().positive('El importe debe ser mayor a 0'),
  personName: z.preprocess(emptyToNull, z.string().max(120).nullable().optional()),
  notes: z.preprocess(emptyToNull, z.string().max(500).nullable().optional()),
  bankAccountId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
}).superRefine((d, ctx) => {
  if (!(CASH_MOVEMENT_CONCEPTS[d.type] as readonly string[]).includes(d.concept)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['concept'], message: 'El concepto no corresponde al tipo de movimiento' });
  }
  if (BANK_CASH_CONCEPTS.includes(d.concept) && !d.bankAccountId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bankAccountId'], message: 'Elegí la cuenta bancaria' });
  }
});

export type CreateCashMovementDTO = z.infer<typeof createCashMovementSchema>;
export type CreateCashRegisterDTO = z.infer<typeof createCashRegisterSchema>;
export type UpdateCashRegisterDTO = z.infer<typeof updateCashRegisterSchema>;
export type CreateCashRegisterCloseDTO = z.infer<typeof createCashRegisterCloseSchema>;
