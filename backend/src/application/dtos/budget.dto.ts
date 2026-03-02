import { z } from 'zod';

export const budgetItemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().min(1, 'La descripción es requerida'),
  quantity: z.number().positive('Cantidad debe ser mayor a 0'),
  unitPrice: z.number().min(0, 'Precio debe ser mayor o igual a 0'),
  taxRate: z.number().min(0).max(100),
  subtotal: z.number().min(0),
  taxAmount: z.number().min(0),
  total: z.number().min(0),
});

export const createBudgetSchema = z.object({
  type: z.enum([
    'FACTURA_A', 'FACTURA_B', 'FACTURA_C',
    'NOTA_CREDITO_A', 'NOTA_CREDITO_B', 'NOTA_CREDITO_C',
    'NOTA_DEBITO_A', 'NOTA_DEBITO_B', 'NOTA_DEBITO_C',
  ]).default('FACTURA_B'),
  customerId: z.string().uuid().optional().nullable(),
  validUntil: z.string().optional().nullable(),
  currency: z.enum(['ARS', 'USD']).default('ARS'),
  exchangeRate: z.number().positive().default(1),
  notes: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  saleCondition: z.enum(['CONTADO', 'CUENTA_CORRIENTE']).default('CONTADO'),
  items: z.array(budgetItemSchema).min(1, 'Agrega al menos un item'),
});

export const updateBudgetSchema = createBudgetSchema.partial();

export const updateBudgetStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'PARTIALLY_PAID', 'PAID']),
});

export const budgetQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  customerId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED', 'EXPIRED', 'PARTIALLY_PAID', 'PAID']).optional(),
  type: z.enum([
    'FACTURA_A', 'FACTURA_B', 'FACTURA_C',
    'NOTA_CREDITO_A', 'NOTA_CREDITO_B', 'NOTA_CREDITO_C',
    'NOTA_DEBITO_A', 'NOTA_DEBITO_B', 'NOTA_DEBITO_C',
  ]).optional(),
  currency: z.enum(['ARS', 'USD']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type CreateBudgetDTO = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetDTO = z.infer<typeof updateBudgetSchema>;
export type UpdateBudgetStatusDTO = z.infer<typeof updateBudgetStatusSchema>;
export type BudgetQueryDTO = z.infer<typeof budgetQuerySchema>;
