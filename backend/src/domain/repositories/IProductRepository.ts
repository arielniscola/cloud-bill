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
  /** Filtra por disponible (quantity - reservedQuantity) sumado entre depósitos. */
  stockState?: 'with' | 'low' | 'out';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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
  /**
   * Asigna (o limpia, con null) la imagen del producto.
   * Devuelve la imageKey anterior para que el llamador borre el objeto huérfano
   * del bucket — si no, cada reemplazo dejaría un archivo que seguimos pagando.
   */
  setImage(
    id: string,
    companyId: string,
    image: { url: string; key: string } | null
  ): Promise<{ previousKey: string | null }>;
}
