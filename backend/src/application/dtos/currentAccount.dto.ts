import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

export const createPaymentSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  description: z.string().optional().default('Payment'),
  currency: z.enum(['ARS', 'USD']).default('ARS'),
});

export const setCreditLimitSchema = z.object({
  creditLimit: z.number().min(0).nullable(),
  currency: z.enum(['ARS', 'USD']).default('ARS'),
});

export const movementQuerySchema = z.object({
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
  currency: z.preprocess(emptyToUndefined, z.enum(['ARS', 'USD']).optional()),
});

export type CreatePaymentDTO = z.infer<typeof createPaymentSchema>;
export type SetCreditLimitDTO = z.infer<typeof setCreditLimitSchema>;
export type MovementQueryDTO = z.infer<typeof movementQuerySchema>;
