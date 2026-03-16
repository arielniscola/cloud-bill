import { z } from 'zod';

export const createReciboSchema = z.object({
  amount: z.number().positive('El monto debe ser mayor a 0'),
  exchangeRate: z.coerce.number().positive().default(1),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MERCADO_PAGO', 'CHECK', 'CARD']),
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
  ordenPedidoId: z.string().optional(),
  customerId: z.string().optional(),
  status: z.enum(['EMITTED', 'CANCELLED']).optional(),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MERCADO_PAGO', 'CHECK', 'CARD']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const updateCheckStatusSchema = z.object({
  checkStatus: z.enum(['PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'RETURNED']),
});

export const reciboCheckQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  customerId: z.string().optional(),
  checkStatus: z.enum(['PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'RETURNED']).optional(),
  dueDateFrom: z.string().optional(),
  dueDateTo: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type CreateReciboDTO = z.infer<typeof createReciboSchema>;
export type ReciboQueryDTO = z.infer<typeof reciboQuerySchema>;
export type UpdateCheckStatusDTO = z.infer<typeof updateCheckStatusSchema>;
export type ReciboCheckQueryDTO = z.infer<typeof reciboCheckQuerySchema>;
