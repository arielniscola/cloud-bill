import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const recurringItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.number().positive('Cantidad debe ser mayor a 0'),
  unitPrice: z.number().min(0),
  discountPct: z.number().min(0).max(100).default(0),
  taxRate: z.number().min(0).max(100).default(21),
});

export const createRecurringInvoiceSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  customerId: z.string().uuid(),
  // Solo facturas (una NC/ND recurrente no tiene sentido)
  type: z.enum(['FACTURA_A', 'FACTURA_B', 'FACTURA_C']).default('FACTURA_B'),
  currency: z.enum(['ARS', 'USD']).default('ARS'),
  exchangeRate: z.number().positive().default(1),
  saleCondition: z.enum(['CONTADO', 'CUENTA_CORRIENTE']).default('CONTADO'),
  paymentTerms: z.preprocess(emptyToUndefined, z.string().optional().nullable()),
  stockBehavior: z.enum(['DISCOUNT', 'RESERVE']).default('DISCOUNT'),
  warehouseId: z.string().uuid().optional().nullable(),
  notes: z.preprocess(emptyToUndefined, z.string().optional().nullable()),
  frequency: z.enum(['WEEKLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY']).default('MONTHLY'),
  // 1-28 para evitar el problema de los meses cortos
  dayOfMonth: z.number().int().min(1).max(28).optional().nullable(),
  useCurrentPrices: z.boolean().default(false),
  startDate: z.string(),
  endDate: z.preprocess(emptyToUndefined, z.string().optional().nullable()),
  items: z.array(recurringItemSchema).min(1, 'Agregá al menos un ítem'),
});

export const updateRecurringInvoiceSchema = createRecurringInvoiceSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const recurringInvoiceQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(20),
  customerId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  isActive: z.preprocess(emptyToUndefined, z.enum(['true', 'false']).optional()),
});

export type CreateRecurringInvoiceDTO = z.infer<typeof createRecurringInvoiceSchema>;
export type UpdateRecurringInvoiceDTO = z.infer<typeof updateRecurringInvoiceSchema>;
