import type { Customer } from './customer.types';
import type { Product } from './product.types';
import type { User } from './auth.types';

export type RemitoStatus = 'PENDING' | 'PARTIALLY_DELIVERED' | 'DELIVERED' | 'CANCELLED';
export type StockBehavior = 'DISCOUNT' | 'RESERVE';

export interface RemitoItem {
  id: string;
  remitoId: string;
  productId: string;
  product?: Product;
  quantity: number;
  deliveredQuantity: number;
}

export interface Remito {
  id: string;
  number: string;
  customerId: string;
  customer?: Customer;
  userId: string;
  user?: User;
  date: string;
  status: RemitoStatus;
  stockBehavior: StockBehavior;
  notes: string | null;
  items: RemitoItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRemitoDTO {
  customerId: string;
  stockBehavior: StockBehavior;
  notes?: string;
  items: { productId: string; quantity: number }[];
}

export interface DeliverRemitoDTO {
  items: { remitoItemId: string; quantity: number }[];
}

export interface RemitoFilters {
  page?: number;
  limit?: number;
  customerId?: string;
  status?: RemitoStatus;
}
