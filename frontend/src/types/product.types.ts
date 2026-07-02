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
  barcode: string | null;
  unit: string | null;
  internalNotes: string | null;
  cost: number;
  price: number;
  salePriceUSD: number | null;
  taxRate: number;
  trackStock: boolean;
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
  rubroId?: string | null;
  brandId?: string | null;
  categoryId?: string | null;
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
  isActive?: boolean;
  minPrice?: number;
  maxPrice?: number;
}
