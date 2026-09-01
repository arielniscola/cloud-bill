import type { Rubro } from './rubro.types';
import type { Brand } from './brand.types';
import type { Category } from './category.types';
import type { ProductCustomFieldValue, ProductCustomFieldValueDTO } from './product-custom-field.types';

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  rubroId: string | null;
  rubro?: Rubro;
  brandId: string | null;
  brand?: Brand;
  categoryId: string | null;
  category?: Category;
  supplierId: string | null;
  supplier?: { id: string; name: string };
  barcode: string | null;
  unit: string | null;
  internalNotes: string | null;
  cost: number;
  price: number;
  salePriceUSD: number | null;
  taxRate: number;
  trackStock: boolean;
  /** URL pública de la imagen — módulo "imagenes". null si no tiene. */
  imageUrl?: string | null;
  priceUpdatedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  customFieldValues?: ProductCustomFieldValue[];
  // Agregado del listado (GET /products): suma de todos los depósitos.
  stockQuantity?: number;
  stockReserved?: number;
  /** Suma de mínimos; null si ningún depósito tiene mínimo definido. */
  stockMinQuantity?: number | null;
}

export interface CreateProductDTO {
  sku: string;
  name: string;
  description?: string | null;
  rubroId?: string | null;
  brandId?: string | null;
  categoryId?: string | null;
  supplierId?: string | null;
  barcode?: string | null;
  unit?: string | null;
  internalNotes?: string | null;
  cost: number;
  price: number;
  salePriceUSD?: number | null;
  taxRate?: number;
  trackStock?: boolean;
  isActive?: boolean;
  customFields?: ProductCustomFieldValueDTO[];
}

export interface UpdateProductDTO extends Partial<CreateProductDTO> {}

export interface ProductFilters {
  page?: number;
  limit?: number;
  search?: string;
  rubroId?: string;
  brandId?: string;
  categoryId?: string;
  supplierId?: string;
  isActive?: boolean;
  minPrice?: number;
  maxPrice?: number;
  stockState?: StockStateFilter;
  sortBy?: ProductSortKey;
  sortOrder?: 'asc' | 'desc';
}

export type StockStateFilter = 'with' | 'low' | 'out';
export type ProductSortKey = 'name' | 'sku' | 'cost' | 'price' | 'priceUpdatedAt';
