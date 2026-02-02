import { z } from 'zod';

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
  dueDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
});

export const updateInvoiceStatusSchema = z.object({
  status: z.enum(['DRAFT', 'ISSUED', 'PAID', 'CANCELLED', 'PARTIALLY_PAID']),
});

export const invoiceQuerySchema = z.object({
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
  customerId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'ISSUED', 'PAID', 'CANCELLED', 'PARTIALLY_PAID']).optional(),
  type: z
    .enum([
      'FACTURA_A',
      'FACTURA_B',
      'FACTURA_C',
      'NOTA_CREDITO_A',
      'NOTA_CREDITO_B',
      'NOTA_CREDITO_C',
      'NOTA_DEBITO_A',
      'NOTA_DEBITO_B',
      'NOTA_DEBITO_C',
    ])
    .optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export type CreateInvoiceDTO = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceStatusDTO = z.infer<typeof updateInvoiceStatusSchema>;
export type InvoiceQueryDTO = z.infer<typeof invoiceQuerySchema>;
