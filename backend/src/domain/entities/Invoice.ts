import { Decimal } from '@prisma/client/runtime/library';
import { InvoiceType, InvoiceStatus } from '../../shared/types';

export interface Invoice {
  id: string;
  type: InvoiceType;
  number: string;
  customerId: string;
  userId: string;
  date: Date;
  dueDate: Date | null;
  subtotal: Decimal;
  taxAmount: Decimal;
  total: Decimal;
  status: InvoiceStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  quantity: Decimal;
  unitPrice: Decimal;
  taxRate: Decimal;
  subtotal: Decimal;
  taxAmount: Decimal;
  total: Decimal;
}

export interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[];
}

export interface CreateInvoiceItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface CreateInvoiceInput {
  type: InvoiceType;
  customerId: string;
  userId: string;
  dueDate?: Date;
  notes?: string;
  items: CreateInvoiceItemInput[];
}

export type UpdateInvoiceInput = Partial<
  Omit<Invoice, 'id' | 'createdAt' | 'updatedAt' | 'number'>
>;
