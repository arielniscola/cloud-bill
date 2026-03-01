import { z } from 'zod';

export const stockMovementSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  type: z.enum([
    'PURCHASE',
    'SALE',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'RETURN',
  ]),
  quantity: z.number().positive('Quantity must be positive'),
  reason: z.string().optional(),
});

export const stockTransferSchema = z.object({
  productId: z.string().uuid(),
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  quantity: z.number().positive('Quantity must be positive'),
});

export const setMinQuantitySchema = z.object({
  minQuantity: z.number().min(0).nullable(),
});

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

export const stockQuerySchema = z.object({
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
  productId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  warehouseId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  type: z.preprocess(
    emptyToUndefined,
    z
      .enum([
        'PURCHASE',
        'SALE',
        'ADJUSTMENT_IN',
        'ADJUSTMENT_OUT',
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'RETURN',
        'REMITO_OUT',
        'RESERVATION',
        'RESERVATION_RELEASE',
      ])
      .optional()
  ),
  startDate: z.preprocess(emptyToUndefined, z.string().optional()),
  endDate: z.preprocess(emptyToUndefined, z.string().optional()),
});

export const bulkAdjustSchema = z.object({
  warehouseId: z.string().uuid(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      newQuantity: z.number().min(0, 'La cantidad no puede ser negativa'),
    })
  ).min(1, 'Se requiere al menos un ítem'),
  reason: z.string().min(1, 'El motivo es requerido'),
});

export type StockMovementDTO = z.infer<typeof stockMovementSchema>;
export type StockTransferDTO = z.infer<typeof stockTransferSchema>;
export type SetMinQuantityDTO = z.infer<typeof setMinQuantitySchema>;
export type StockQueryDTO = z.infer<typeof stockQuerySchema>;
export type BulkAdjustDTO = z.infer<typeof bulkAdjustSchema>;
