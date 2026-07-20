import type { Prisma } from '@prisma/client';
import {
  Warehouse,
  Stock,
  StockMovement,
  CreateWarehouseInput,
  UpdateWarehouseInput,
  CreateStockMovementInput,
} from '../entities/Stock';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface IWarehouseRepository {
  findById(id: string, companyId?: string): Promise<Warehouse | null>;
  findAll(companyId?: string): Promise<Warehouse[]>;
  findDefault(companyId?: string): Promise<Warehouse | null>;
  /**
   * Almacén por defecto de la empresa; si no hay ninguno marcado como default,
   * cae en el primer almacén activo. Se usa para resolver dónde mover stock al
   * emitir comprobantes, evitando que la operación se saltee en silencio cuando
   * la empresa no configuró un almacén por defecto.
   */
  findDefaultOrFirstActive(companyId?: string): Promise<Warehouse | null>;
  create(data: CreateWarehouseInput): Promise<Warehouse>;
  update(id: string, data: UpdateWarehouseInput): Promise<Warehouse>;
  delete(id: string): Promise<void>;
}

export interface BulkAdjustItem {
  productId: string;
  variantId?: string | null;
  newQuantity: number;
}

export interface IStockRepository {
  getStock(productId: string, warehouseId: string, variantId?: string | null): Promise<Stock | null>;
  getStockByProduct(productId: string): Promise<Stock[]>;
  getStockByWarehouse(warehouseId: string): Promise<Stock[]>;
  updateStock(productId: string, warehouseId: string, quantity: number, variantId?: string | null): Promise<Stock>;
  setMinQuantity(productId: string, warehouseId: string, minQuantity: number | null, variantId?: string | null): Promise<Stock>;
  getLowStockItems(warehouseId?: string): Promise<Stock[]>;
  /** `tx`: cliente de transacción opcional para participar de una transacción externa. */
  addMovement(data: CreateStockMovementInput, tx?: Prisma.TransactionClient): Promise<StockMovement>;
  getMovements(
    filters: { productId?: string; variantId?: string; warehouseId?: string; type?: string; startDate?: string; endDate?: string },
    pagination?: PaginationParams
  ): Promise<PaginatedResult<StockMovement>>;
  transfer(
    productId: string,
    fromWarehouseId: string,
    toWarehouseId: string,
    quantity: number,
    userId?: string,
    variantId?: string | null
  ): Promise<void>;
  adjustBulk(
    warehouseId: string,
    items: BulkAdjustItem[],
    reason: string,
    userId?: string
  ): Promise<void>;
  exportWarehouseStock(warehouseId: string): Promise<string>;
  /** Increment reservedQuantity (variant-aware). Creates row if missing. */
  incrementReserved(productId: string, warehouseId: string, quantity: number, variantId?: string | null, tx?: Prisma.TransactionClient): Promise<void>;
  /** Decrement reservedQuantity (variant-aware). Floors at 0. */
  decrementReserved(productId: string, warehouseId: string, quantity: number, variantId?: string | null, tx?: Prisma.TransactionClient): Promise<void>;
}
