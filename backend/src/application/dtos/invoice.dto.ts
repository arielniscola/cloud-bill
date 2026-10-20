import { z } from 'zod';
import { itemLotsSchema } from './stock.dto';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const invoiceItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  // Detalle libre de la línea (servicios / productos no inventariados).
  detail: z.string().max(2000).optional().nullable(),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().min(0, 'Unit price must be positive'),
  discountPct: z.number().min(0).max(100).default(0),
  taxRate: z.number().min(0).max(100).default(21),
  // Lotes elegidos (productos con lotes); se usan al emitir, cuando sale el stock.
  lots: itemLotsSchema,
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
  // Sin cliente = venta a "Consumidor Final" (se resuelve en el controller).
  customerId: z.preprocess(emptyToUndefined, z.string().uuid().optional().nullable()),
  dueDate: z.preprocess(emptyToUndefined, z.string().optional()),
  notes: z.preprocess(emptyToUndefined, z.string().optional()),
  currency: z.enum(['ARS', 'USD']).default('ARS'),
  exchangeRate: z.number().positive().default(1),
  // Condición de cobro: CUENTA_CORRIENTE (o un plazo "a X días") genera el
  // movimiento en la cuenta corriente del cliente al crear la factura.
  saleCondition: z.enum(['CONTADO', 'CUENTA_CORRIENTE']).default('CONTADO'),
  paymentTerms: z.preprocess(emptyToUndefined, z.string().optional().nullable()),
  // Transporte (texto libre, se imprime en el comprobante)
  transport: z.string().max(200).optional().nullable(),
  originInvoiceId: z.string().uuid().optional().nullable(),
  stockBehavior: z.enum(['DISCOUNT', 'RESERVE']).default('DISCOUNT'),
  // Depósito del que descontar/reservar stock (null = depósito por defecto)
  warehouseId: z.string().uuid().optional().nullable(),
  // Remitos libres que factura (solo al crear): sus cantidades se facturan tal
  // cual y la factura no mueve stock, porque ya lo descontaron los remitos.
  remitoIds: z.array(z.string().uuid()).optional(),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
});

export const updateInvoiceStatusSchema = z.object({
  status: z.enum(['DRAFT', 'ISSUED', 'AUTHORIZED', 'PAID', 'CANCELLED', 'PARTIALLY_PAID']),
});

export const payInvoiceSchema = z.object({
  amount: z.number().positive('El monto debe ser mayor a 0'),
  // COMPENSACION = aplicar saldo a favor del cliente (NC, NC interna o pago a
  // cuenta): no mueve caja ni banco. Requiere creditInvoiceId o creditMovementId.
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MERCADO_PAGO', 'CHECK', 'CARD', 'COMPENSACION']),
  cashRegisterId: z.string().uuid().optional().nullable(),
  // Transferencia: cuenta donde entra la plata. Sin declararlo acá Zod lo
  // descartaba y el cobro no generaba el movimiento bancario.
  bankAccountId: z.string().uuid().optional().nullable(),
  reference: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  checkDueDate: z.string().optional().nullable(),
  installments: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Tarjeta: recargo por cuotas (informativo, `amount` es la base). Mismo
  // problema que bankAccountId: sin declararlos se perdían.
  cardId: z.string().optional().nullable(),
  surchargePercent: z.number().min(0).optional().nullable(),
  surchargeAmount: z.number().min(0).optional().nullable(),
  // Ajustes del cobro: descuento cedido (baja lo que se cobra) y recargo/interés
  // (deuda nueva que este cobro cubre). Lo aplicado a la factura es
  // amount + discountAmount − interestAmount.
  discountAmount: z.number().min(0).optional().default(0),
  interestAmount: z.number().min(0).optional().default(0),
  creditInvoiceId: z.string().uuid().optional().nullable(),
  creditMovementId: z.string().uuid().optional().nullable(),
}).refine(
  (d) => d.paymentMethod !== 'COMPENSACION' || (!!d.creditInvoiceId !== !!d.creditMovementId),
  { message: 'Elegí el saldo a favor a aplicar', path: ['creditMovementId'] },
);

export const invoiceQuerySchema = z.object({
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
  customerId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  userId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  status: z.preprocess(emptyToUndefined, z.enum(['DRAFT', 'ISSUED', 'AUTHORIZED', 'PAID', 'CANCELLED', 'PARTIALLY_PAID']).optional()),
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
  dateFrom: z.preprocess(emptyToUndefined, z.string().optional()),
  dateTo: z.preprocess(emptyToUndefined, z.string().optional()),
  currency: z.preprocess(emptyToUndefined, z.enum(['ARS', 'USD']).optional()),
  // `validate()` reemplaza req.query con el parseado, y Zod descarta las claves
  // que no estén acá. saleCondition faltaba: el controller lo leía pero nunca
  // llegaba, así que el filtro de condición de venta no hacía nada.
  saleCondition: z.preprocess(emptyToUndefined, z.enum(['CONTADO', 'CUENTA_CORRIENTE']).optional()),
  search: z.preprocess(emptyToUndefined, z.string().max(120).optional()),
  // 'true' = formales sin CAE en un estado emitible (para emitirlas en lote).
  pendingArca: z.preprocess(emptyToUndefined, z.enum(['true', 'false']).optional()),
});

/** Lote de emisión ante ARCA (ver InvoiceController.emitBatch). */
export const emitBatchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  redateToToday: z.boolean().optional().default(false),
});

export type CreateInvoiceDTO = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceStatusDTO = z.infer<typeof updateInvoiceStatusSchema>;
export type PayInvoiceDTO = z.infer<typeof payInvoiceSchema>;
export type InvoiceQueryDTO = z.infer<typeof invoiceQuerySchema>;
