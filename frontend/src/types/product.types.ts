import type { Category } from './category.types';
import type { Brand } from './brand.types';

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  category?: Category;
  brandId: string | null;
  brand?: Brand;
  barcode: string | null;
  unit: string | null;
  internalNotes: string | null;
  cost: number;
  price: number;
  taxRate: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductDTO {
  sku: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  barcode?: string | null;
  unit?: string | null;
  internalNotes?: string | null;
  cost: number;
  price: number;
  taxRate?: number;
  isActive?: boolean;
}

export interface UpdateProductDTO extends Partial<CreateProductDTO> {}

export interface ProductFilters {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  brandId?: string;
  isActive?: boolean;
  minPrice?: number;
  maxPrice?: number;
}
