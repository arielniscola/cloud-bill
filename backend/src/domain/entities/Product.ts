import { Decimal } from '@prisma/client/runtime/library';

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  cost: Decimal;
  price: Decimal;
  taxRate: Decimal;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateProductInput = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>;
