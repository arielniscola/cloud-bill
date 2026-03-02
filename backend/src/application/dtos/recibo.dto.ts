import { z } from 'zod';

export const createReciboSchema = z.object({
  amount: z.number().positive('El monto debe ser mayor a 0'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'CARD']),
  cashRegisterId: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  checkDueDate: z.string().optional().nullable(),
  installments: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const reciboQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  invoiceId: z.string().optional(),
  budgetId: z.string().optional(),
  customerId: z.string().optional(),
  status: z.enum(['EMITTED', 'CANCELLED']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type CreateReciboDTO = z.infer<typeof createReciboSchema>;
export type ReciboQueryDTO = z.infer<typeof reciboQuerySchema>;
