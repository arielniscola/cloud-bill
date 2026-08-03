import { Product, CreateProductInput, UpdateProductInput } from '../entities/Product';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface ProductFilters {
  search?: string;
  rubroId?: string;
  brandId?: string;
  supplierId?: string;
  isActive?: boolean;
  minPrice?: number;
  maxPrice?: number;
  companyId?: string;
}

export interface IProductRepository {
  findById(id: string, companyId?: string): Promise<Product | null>;
  findBySku(sku: string, companyId: string): Promise<Product | null>;
  findAll(
    pagination?: PaginationParams,
    filters?: ProductFilters
  ): Promise<PaginatedResult<Product>>;
  create(data: CreateProductInput): Promise<Product>;
  update(id: string, data: UpdateProductInput): Promise<Product>;
  /** Actualiza en un único UPDATE todos los productos que matchean el filtro (sin traerlos a memoria) — escala sin importar cuántos sean. Devuelve la cantidad afectada. */
  updateByFilter(filters: ProductFilters, data: UpdateProductInput): Promise<number>;
  delete(id: string): Promise<void>;
}
