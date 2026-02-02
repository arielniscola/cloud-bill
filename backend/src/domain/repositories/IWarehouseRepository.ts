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
  findById(id: string): Promise<Warehouse | null>;
  findAll(): Promise<Warehouse[]>;
  findDefault(): Promise<Warehouse | null>;
  create(data: CreateWarehouseInput): Promise<Warehouse>;
  update(id: string, data: UpdateWarehouseInput): Promise<Warehouse>;
  delete(id: string): Promise<void>;
}

export interface IStockRepository {
  getStock(productId: string, warehouseId: string): Promise<Stock | null>;
  getStockByProduct(productId: string): Promise<Stock[]>;
  getStockByWarehouse(warehouseId: string): Promise<Stock[]>;
  updateStock(productId: string, warehouseId: string, quantity: number): Promise<Stock>;
  setMinQuantity(productId: string, warehouseId: string, minQuantity: number | null): Promise<Stock>;
  getLowStockItems(warehouseId?: string): Promise<Stock[]>;
  addMovement(data: CreateStockMovementInput): Promise<StockMovement>;
  getMovements(
    filters: { productId?: string; warehouseId?: string },
    pagination?: PaginationParams
  ): Promise<PaginatedResult<StockMovement>>;
  transfer(
    productId: string,
    fromWarehouseId: string,
    toWarehouseId: string,
    quantity: number,
    userId?: string
  ): Promise<void>;
}
