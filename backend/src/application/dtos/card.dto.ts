import { z } from 'zod';

const surchargeSchema = z.object({
  installments: z.coerce.number().int().positive(),
  surchargePercent: z.coerce.number().min(0).max(100),
});

export const createCardSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  type: z.enum(['CREDIT', 'DEBIT']).default('CREDIT'),
  bank: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  surcharges: z.array(surchargeSchema).default([]),
});

export const updateCardSchema = createCardSchema.partial();

export type CreateCardDTO = z.infer<typeof createCardSchema>;
export type UpdateCardDTO = z.infer<typeof updateCardSchema>;
