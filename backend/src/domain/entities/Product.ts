import { Decimal } from '@prisma/client/runtime/library';
import { ProductCustomFieldValue } from './ProductCustomField';

export interface Product {
  id: string;
  sku: string;
  name: string;
  companyId?: string | null;
  description: string | null;
  categoryId: string | null;
  brandId: string | null;
  rubroId: string | null;
  barcode: string | null;
  unit: string | null;
  internalNotes: string | null;
  cost: Decimal;
  price: Decimal;
  salePriceUSD?: Decimal | null;
  taxRate: Decimal;
  leadTimeDays?: number | null;
  priceUpdatedAt?: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  customFieldValues?: ProductCustomFieldValue[];
}

export type CreateProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateProductInput = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>;
