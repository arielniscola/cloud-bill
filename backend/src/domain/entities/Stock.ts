import { Decimal } from '@prisma/client/runtime/library';
import { StockMovementType } from '../../shared/types';

export interface Warehouse {
  id: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Stock {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: Decimal;
  minQuantity: Decimal | null;
  updatedAt: Date;
}

export interface StockMovement {
  id: string;
  productId: string;
  warehouseId: string;
  type: StockMovementType;
  quantity: Decimal;
  previousQuantity: Decimal;
  newQuantity: Decimal;
  reason: string | null;
  referenceId: string | null;
  userId: string | null;
  relatedWarehouseId: string | null;
  createdAt: Date;
}

export type CreateWarehouseInput = Omit<Warehouse, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateWarehouseInput = Partial<Omit<Warehouse, 'id' | 'createdAt' | 'updatedAt'>>;

export interface CreateStockMovementInput {
  productId: string;
  warehouseId: string;
  type: StockMovementType;
  quantity: number;
  reason?: string;
  referenceId?: string;
  userId?: string;
  relatedWarehouseId?: string;
}
