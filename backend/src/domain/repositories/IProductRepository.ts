import { Product, CreateProductInput, UpdateProductInput } from '../entities/Product';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  minPrice?: number;
  maxPrice?: number;
}

export interface IProductRepository {
  findById(id: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  findAll(
    pagination?: PaginationParams,
    filters?: ProductFilters
  ): Promise<PaginatedResult<Product>>;
  create(data: CreateProductInput): Promise<Product>;
  update(id: string, data: UpdateProductInput): Promise<Product>;
  delete(id: string): Promise<void>;
}
