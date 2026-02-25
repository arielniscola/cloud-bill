import { z } from 'zod';

const purchaseItemSchema = z.object({
  description: z.string().min(1, 'La descripción es requerida'),
  quantity: z.number().positive('La cantidad debe ser positiva'),
  unitPrice: z.number().min(0, 'El precio debe ser positivo'),
  taxRate: z.number().min(0).max(100).default(21),
});

export const createPurchaseSchema = z.object({
  type: z.enum([
    'FACTURA_A', 'FACTURA_B', 'FACTURA_C',
    'NOTA_CREDITO_A', 'NOTA_CREDITO_B', 'NOTA_CREDITO_C',
    'NOTA_DEBITO_A', 'NOTA_DEBITO_B', 'NOTA_DEBITO_C',
  ]),
  number: z.string().min(1, 'El número de comprobante es requerido'),
  supplierId: z.string().uuid('ID de proveedor inválido'),
  date: z.string().optional(),
  currency: z.enum(['ARS', 'USD']).default('ARS'),
  notes: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1, 'Se requiere al menos un ítem'),
});

export type CreatePurchaseDTO = z.infer<typeof createPurchaseSchema>;
