import { z } from 'zod';

export const ordenPedidoItemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().min(1, 'La descripción es requerida'),
  quantity: z.number().positive('Cantidad debe ser mayor a 0'),
  unitPrice: z.number().min(0, 'Precio debe ser mayor o igual a 0'),
  taxRate: z.number().min(0).max(100),
  subtotal: z.number().min(0),
  taxAmount: z.number().min(0),
  total: z.number().min(0),
});

export const createOrdenPedidoSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  currency: z.enum(['ARS', 'USD']).default('ARS'),
  exchangeRate: z.number().positive().default(1),
  notes: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  saleCondition: z.enum(['CONTADO', 'CUENTA_CORRIENTE']).default('CONTADO'),
  stockBehavior: z.enum(['DISCOUNT', 'RESERVE']).default('DISCOUNT'),
  cashRegisterId: z.string().uuid().optional().nullable(),
  invoiceCashRegisterId: z.string().uuid().optional().nullable(),
  items: z.array(ordenPedidoItemSchema).min(1, 'Agrega al menos un item'),
});

export const updateOrdenPedidoSchema = createOrdenPedidoSchema.partial();

export const updateOrdenPedidoStatusSchema = z.object({
  status: z.enum(['DRAFT', 'CONFIRMED', 'CANCELLED']),
});

export const ordenPedidoQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  customerId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'CONVERTED']).optional(),
  currency: z.enum(['ARS', 'USD']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type CreateOrdenPedidoDTO = z.infer<typeof createOrdenPedidoSchema>;
export type UpdateOrdenPedidoDTO = z.infer<typeof updateOrdenPedidoSchema>;
export type UpdateOrdenPedidoStatusDTO = z.infer<typeof updateOrdenPedidoStatusSchema>;
export type OrdenPedidoQueryDTO = z.infer<typeof ordenPedidoQuerySchema>;
