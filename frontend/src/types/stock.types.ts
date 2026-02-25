import type { Product } from './product.types';
import type { Warehouse } from './warehouse.types';

export type StockMovementType =
  | 'PURCHASE'
  | 'SALE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'RETURN'
  | 'REMITO_OUT'
  | 'RESERVATION'
  | 'RESERVATION_RELEASE';

export interface Stock {
  id: string;
  productId: string;
  warehouseId: string;
  product?: Product;
  warehouse?: Warehouse;
  quantity: number;
  reservedQuantity: number;
  minQuantity: number | null;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  warehouseId: string;
  product?: Product;
  warehouse?: Warehouse;
  type: StockMovementType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string | null;
  referenceId: string | null;
  userId: string | null;
  relatedWarehouseId: string | null;
  createdAt: string;
}

export interface CreateStockMovementDTO {
  productId: string;
  warehouseId: string;
  type: StockMovementType;
  quantity: number;
  reason?: string;
  referenceId?: string;
}

export interface StockTransferDTO {
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  reason?: string;
}

export interface SetMinQuantityDTO {
  minQuantity: number | null;
}

export interface StockMovementFilters {
  page?: number;
  limit?: number;
  productId?: string;
  warehouseId?: string;
  type?: StockMovementType;
  startDate?: string;
  endDate?: string;
}
