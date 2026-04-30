import type { Category } from './category.types';
import type { Brand } from './brand.types';
import type { Rubro } from './rubro.types';
import type { ProductCustomFieldValue, ProductCustomFieldValueDTO } from './product-custom-field.types';

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  category?: Category;
  brandId: string | null;
  brand?: Brand;
  rubroId: string | null;
  rubro?: Rubro;
  barcode: string | null;
  unit: string | null;
  internalNotes: string | null;
  cost: number;
  price: number;
  salePriceUSD: number | null;
  taxRate: number;
  priceUpdatedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  customFieldValues?: ProductCustomFieldValue[];
}

export interface CreateProductDTO {
  sku: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  rubroId?: string | null;
  barcode?: string | null;
  unit?: string | null;
  internalNotes?: string | null;
  cost: number;
  price: number;
  salePriceUSD?: number | null;
  taxRate?: number;
  isActive?: boolean;
  customFields?: ProductCustomFieldValueDTO[];
}

export interface UpdateProductDTO extends Partial<CreateProductDTO> {}

export interface ProductFilters {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  brandId?: string;
  rubroId?: string;
  isActive?: boolean;
  minPrice?: number;
  maxPrice?: number;
}
