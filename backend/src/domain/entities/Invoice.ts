import { Decimal } from '@prisma/client/runtime/library';
import { InvoiceType, InvoiceStatus, Currency } from '../../shared/types';

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
  currency: Currency;
  exchangeRate: Decimal;
  status: InvoiceStatus;
  notes: string | null;
  cae: string | null;
  caeExpiry: Date | null;
  afipPtVenta: number | null;
  afipCbtNum: number | null;
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
  currency: Currency;
  exchangeRate: number;
  items: CreateInvoiceItemInput[];
}

export type UpdateInvoiceInput = Partial<
  Omit<Invoice, 'id' | 'createdAt' | 'updatedAt' | 'number'>
>;
