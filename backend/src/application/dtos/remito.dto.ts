import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const remitoItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.number().positive('Quantity must be positive'),
});

export const createRemitoSchema = z.object({
  customerId: z.string().uuid(),
  // Optional: the controller derives stockBehavior from the source document
  // (invoice/budget/ordenPedido) or defaults to DISCOUNT for standalone remitos.
  stockBehavior: z.enum(['DISCOUNT', 'RESERVE']).optional(),
  notes: z.preprocess(emptyToUndefined, z.string().optional()),
  invoiceId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  budgetId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  ordenPedidoId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  items: z.array(remitoItemSchema).min(1, 'At least one item is required'),
});

const deliverItemSchema = z.object({
  remitoItemId: z.string().uuid(),
  quantity: z.number().positive('Quantity must be positive'),
});

export const deliverRemitoSchema = z.object({
  items: z.array(deliverItemSchema).min(1, 'At least one item is required'),
});

// OJO: el middleware validate() reemplaza req.query con el resultado del parse.
// Todo filtro que el controller lea DEBE estar declarado acá, si no Zod lo
// descarta en silencio (mismo bug que saleCondition en facturas).
export const remitoQuerySchema = z.object({
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
  customerId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  status: z.preprocess(
    emptyToUndefined,
    z.enum(['PENDING', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED']).optional()
  ),
  ordenPedidoId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  invoiceId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  budgetId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  dateFrom: z.preprocess(emptyToUndefined, z.string().optional()),
  dateTo: z.preprocess(emptyToUndefined, z.string().optional()),
});

export type CreateRemitoDTO = z.infer<typeof createRemitoSchema>;
export type DeliverRemitoDTO = z.infer<typeof deliverRemitoSchema>;
export type RemitoQueryDTO = z.infer<typeof remitoQuerySchema>;
