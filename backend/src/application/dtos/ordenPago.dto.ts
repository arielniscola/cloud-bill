import { z } from 'zod';

const paymentMethodSchema = z.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'CARD', 'MERCADO_PAGO']);

export const createOrdenPagoItemSchema = z.object({
  purchaseId: z.string().min(1),
  amount: z.number().positive('El monto debe ser mayor a 0'),
});

export const createOrdenPagoSchema = z.object({
  supplierId:     z.string().min(1, 'Proveedor requerido'),
  cashRegisterId: z.string().optional(),
  date:           z.string().optional(),
  currency:       z.enum(['ARS', 'USD']).default('ARS'),
  exchangeRate:   z.number().positive().default(1),
  paymentMethod:  paymentMethodSchema,
  reference:      z.string().optional(),
  bank:           z.string().optional(),
  checkDueDate:   z.string().optional(),
  notes:          z.string().optional(),
  items: z.array(createOrdenPagoItemSchema).min(1, 'Se requiere al menos una compra'),
});

export const ordenPagoQuerySchema = z.object({
  page:          z.coerce.number().default(1),
  limit:         z.coerce.number().default(20),
  supplierId:    z.string().optional(),
  status:        z.string().optional(),
  paymentMethod: z.string().optional(),
  dateFrom:      z.string().optional(),
  dateTo:        z.string().optional(),
});

export type CreateOrdenPagoDTO = z.infer<typeof createOrdenPagoSchema>;
export type OrdenPagoQueryDTO  = z.infer<typeof ordenPagoQuerySchema>;
