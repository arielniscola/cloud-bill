import { Decimal } from '@prisma/client/runtime/library';
import { InvoiceType, Currency } from '../../shared/types';

export type PurchaseStatus = 'REGISTERED' | 'CANCELLED';

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  description: string;
  quantity: Decimal;
  unitPrice: Decimal;
  taxRate: Decimal;
  subtotal: Decimal;
  taxAmount: Decimal;
  total: Decimal;
}

export interface Purchase {
  id: string;
  type: InvoiceType;
  number: string;
  supplierId: string;
  userId: string;
  date: Date;
  subtotal: Decimal;
  taxAmount: Decimal;
  total: Decimal;
  currency: Currency;
  status: PurchaseStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseWithItems extends Purchase {
  items: PurchaseItem[];
  supplier?: { id: string; name: string; cuit: string | null };
  user?: { id: string; name: string; email: string };
}

export interface CreatePurchaseItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface CreatePurchaseInput {
  type: InvoiceType;
  number: string;
  supplierId: string;
  userId: string;
  date?: Date;
  currency?: Currency;
  notes?: string;
  items: CreatePurchaseItemInput[];
}

export type UpdatePurchaseInput = Partial<Omit<Purchase, 'id' | 'createdAt' | 'updatedAt'>>;
