import { z } from 'zod';

export const createPaymentSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  description: z.string().optional().default('Payment'),
});

export const setCreditLimitSchema = z.object({
  creditLimit: z.number().min(0).nullable(),
});

export const movementQuerySchema = z.object({
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
});

export type CreatePaymentDTO = z.infer<typeof createPaymentSchema>;
export type SetCreditLimitDTO = z.infer<typeof setCreditLimitSchema>;
export type MovementQueryDTO = z.infer<typeof movementQuerySchema>;
