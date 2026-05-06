export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  priceOverride: number | string | null;
  costOverride: number | string | null;
  barcode: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductVariantDTO {
  sku: string;
  name: string;
  attributes?: Record<string, string>;
  priceOverride?: number | null;
  costOverride?: number | null;
  barcode?: string | null;
  isActive?: boolean;
}

export type UpdateProductVariantDTO = Partial<CreateProductVariantDTO>;

export interface BulkCreateProductVariantDTO {
  skuPrefix: string;
  attributeMatrix: Record<string, string[]>;
  priceOverride?: number | null;
  costOverride?: number | null;
}
