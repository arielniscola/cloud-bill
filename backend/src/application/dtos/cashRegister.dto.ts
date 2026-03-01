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

export type CreateCashRegisterDTO = z.infer<typeof createCashRegisterSchema>;
export type UpdateCashRegisterDTO = z.infer<typeof updateCashRegisterSchema>;
export type CreateCashRegisterCloseDTO = z.infer<typeof createCashRegisterCloseSchema>;
