import type { InvoiceType, Currency } from './invoice.types';
import type { Supplier } from './supplier.types';

export type PurchaseStatus = 'REGISTERED' | 'CANCELLED';

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface Purchase {
  id: string;
  type: InvoiceType;
  number: string;
  supplierId: string;
  supplier?: Pick<Supplier, 'id' | 'name' | 'cuit'>;
  userId: string;
  user?: { id: string; name: string; email: string };
  date: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: Currency;
  status: PurchaseStatus;
  notes: string | null;
  items: PurchaseItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseItemDTO {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface CreatePurchaseDTO {
  type: InvoiceType;
  number: string;
  supplierId: string;
  date?: string;
  currency?: Currency;
  notes?: string;
  items: CreatePurchaseItemDTO[];
}

export interface PurchaseFilters {
  page?: number;
  limit?: number;
  supplierId?: string;
  status?: PurchaseStatus;
  dateFrom?: string;
  dateTo?: string;
}
