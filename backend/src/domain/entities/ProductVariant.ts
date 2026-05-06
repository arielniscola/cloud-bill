import { Decimal } from '@prisma/client/runtime/library';

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  priceOverride: Decimal | null;
  costOverride: Decimal | null;
  barcode: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductVariantInput {
  productId: string;
  sku: string;
  name: string;
  attributes?: Record<string, string>;
  priceOverride?: Decimal | number | null;
  costOverride?: Decimal | number | null;
  barcode?: string | null;
  isActive?: boolean;
  companyId: string;
}

export type UpdateProductVariantInput = Partial<Omit<CreateProductVariantInput, 'companyId' | 'productId'>>;
