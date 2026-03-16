import { z } from 'zod';

export const ordenCompraItemSchema = z.object({
  productId:   z.string().uuid().optional().nullable(),
  description: z.string().min(1, 'La descripción es requerida'),
  quantity:    z.coerce.number().positive('Cantidad debe ser mayor a 0'),
  unitPrice:   z.coerce.number().min(0),
  taxRate:     z.coerce.number().min(0).max(100),
  subtotal:    z.coerce.number().min(0),
  taxAmount:   z.coerce.number().min(0),
  total:       z.coerce.number().min(0),
});

export const createOrdenCompraSchema = z.object({
  supplierId:   z.string().uuid('Proveedor requerido'),
  date:         z.string().optional(),
  expectedDate: z.string().optional().nullable(),
  currency:     z.enum(['ARS', 'USD']).default('ARS'),
  exchangeRate: z.coerce.number().positive().default(1),
  warehouseId:  z.string().uuid().optional().nullable(),
  notes:        z.string().optional().nullable(),
  items:        z.array(ordenCompraItemSchema).min(1, 'Agrega al menos un ítem'),
});

export const updateOrdenCompraSchema = createOrdenCompraSchema.partial();

export const updateOrdenCompraStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'CONFIRMED', 'CANCELLED']),
});

export const ordenCompraQuerySchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().positive().max(100).default(20),
  supplierId: z.string().uuid().optional(),
  status:     z.enum(['DRAFT', 'SENT', 'CONFIRMED', 'RECEIVED', 'CANCELLED']).optional(),
  dateFrom:   z.string().optional(),
  dateTo:     z.string().optional(),
});

export type CreateOrdenCompraDTO      = z.infer<typeof createOrdenCompraSchema>;
export type UpdateOrdenCompraDTO      = z.infer<typeof updateOrdenCompraSchema>;
export type UpdateOrdenCompraStatusDTO = z.infer<typeof updateOrdenCompraStatusSchema>;
export type OrdenCompraQueryDTO       = z.infer<typeof ordenCompraQuerySchema>;
