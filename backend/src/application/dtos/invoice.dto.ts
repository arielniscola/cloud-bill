import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const invoiceItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().min(0, 'Unit price must be positive'),
  taxRate: z.number().min(0).max(100).default(21),
});

export const createInvoiceSchema = z.object({
  type: z.enum([
    'FACTURA_A',
    'FACTURA_B',
    'FACTURA_C',
    'NOTA_CREDITO_A',
    'NOTA_CREDITO_B',
    'NOTA_CREDITO_C',
    'NOTA_DEBITO_A',
    'NOTA_DEBITO_B',
    'NOTA_DEBITO_C',
  ]),
  customerId: z.string().uuid(),
  dueDate: z.preprocess(emptyToUndefined, z.string().optional()),
  notes: z.preprocess(emptyToUndefined, z.string().optional()),
  currency: z.enum(['ARS', 'USD']).default('ARS'),
  exchangeRate: z.number().positive().default(1),
  originInvoiceId: z.string().uuid().optional().nullable(),
  stockBehavior: z.enum(['DISCOUNT', 'RESERVE']).default('DISCOUNT'),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
});

export const updateInvoiceStatusSchema = z.object({
  status: z.enum(['DRAFT', 'ISSUED', 'PAID', 'CANCELLED', 'PARTIALLY_PAID']),
});

export const payInvoiceSchema = z.object({
  amount: z.number().positive('El monto debe ser mayor a 0'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MERCADO_PAGO', 'CHECK', 'CARD']),
  cashRegisterId: z.string().uuid().optional().nullable(),
  reference: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  checkDueDate: z.string().optional().nullable(),
  installments: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const invoiceQuerySchema = z.object({
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
  customerId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  userId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  status: z.preprocess(emptyToUndefined, z.enum(['DRAFT', 'ISSUED', 'PAID', 'CANCELLED', 'PARTIALLY_PAID']).optional()),
  type: z.preprocess(
    emptyToUndefined,
    z.enum([
      'FACTURA_A',
      'FACTURA_B',
      'FACTURA_C',
      'NOTA_CREDITO_A',
      'NOTA_CREDITO_B',
      'NOTA_CREDITO_C',
      'NOTA_DEBITO_A',
      'NOTA_DEBITO_B',
      'NOTA_DEBITO_C',
    ]).optional(),
  ),
  dateFrom: z.preprocess(emptyToUndefined, z.string().datetime().optional()),
  dateTo: z.preprocess(emptyToUndefined, z.string().datetime().optional()),
  currency: z.preprocess(emptyToUndefined, z.enum(['ARS', 'USD']).optional()),
});

export type CreateInvoiceDTO = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceStatusDTO = z.infer<typeof updateInvoiceStatusSchema>;
export type PayInvoiceDTO = z.infer<typeof payInvoiceSchema>;
export type InvoiceQueryDTO = z.infer<typeof invoiceQuerySchema>;
