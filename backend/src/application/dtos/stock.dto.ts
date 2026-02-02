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

export const stockQuerySchema = z.object({
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
});

export type StockMovementDTO = z.infer<typeof stockMovementSchema>;
export type StockTransferDTO = z.infer<typeof stockTransferSchema>;
export type SetMinQuantityDTO = z.infer<typeof setMinQuantitySchema>;
export type StockQueryDTO = z.infer<typeof stockQuerySchema>;
