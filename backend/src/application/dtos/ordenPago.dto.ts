import { z } from 'zod';

const paymentMethodSchema = z.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'CARD', 'MERCADO_PAGO']);

export const createOrdenPagoItemSchema = z.object({
  purchaseInvoiceId: z.string().min(1),
  amount: z.number().positive('El monto debe ser mayor a 0'),
});

// Ajuste al pago (descuento obtenido = RESTA, interés = SUMA). Referencia una
// cuenta del plan contable (opcional) y modifica el total a pagar.
export const ordenPagoAjusteSchema = z.object({
  accountId:   z.string().optional().nullable(),
  accountCode: z.string().optional().nullable(),
  description: z.string().min(1, 'El concepto es requerido'),
  type:        z.enum(['SUMA', 'RESTA']),
  amount:      z.number().positive('El monto debe ser mayor a 0'),
});

// Cheque propio (EGRESO) a emitir desde una chequera al pagar
export const ordenPagoChequePropioSchema = z.object({
  chequeraId:  z.string().optional(),   // si se indica, hereda banco + N° del talonario
  checkNumber: z.string().optional(),   // N° manual (override del talonario)
  bank:        z.string().optional(),
  amount:      z.number().positive('El monto del cheque debe ser mayor a 0'),
  dueDate:     z.string().optional(),
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
  // Si no se seleccionan facturas, la OP es un "pago a cuenta" y se usa `amount`.
  items: z.array(createOrdenPagoItemSchema).optional().default([]),
  amount: z.number().positive('El importe debe ser mayor a 0').optional(),
  // Ajustes (descuentos / intereses) que modifican el total a pagar
  ajustes: z.array(ordenPagoAjusteSchema).optional().default([]),
  // Pago con cheques: ids de cheques de tercero en cartera a endosar + cheques propios a emitir
  chequesEnCartera: z.array(z.string()).optional(),
  chequesPropios:   z.array(ordenPagoChequePropioSchema).optional(),
}).refine(
  (d) => d.items.length > 0 || (typeof d.amount === 'number' && d.amount > 0),
  { message: 'Seleccioná al menos una factura o indicá un importe para el pago a cuenta', path: ['amount'] },
);

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
