import type { Customer } from './customer.types';
import type { Product } from './product.types';
import type { User } from './auth.types';

export type InvoiceType =
  | 'FACTURA_A'
  | 'FACTURA_B'
  | 'FACTURA_C'
  | 'NOTA_CREDITO_A'
  | 'NOTA_CREDITO_B'
  | 'NOTA_CREDITO_C'
  | 'NOTA_DEBITO_A'
  | 'NOTA_DEBITO_B'
  | 'NOTA_DEBITO_C';

export type InvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PAID'
  | 'CANCELLED'
  | 'PARTIALLY_PAID';

export type Currency = 'ARS' | 'USD';

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  product?: Product;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface Invoice {
  id: string;
  type: InvoiceType;
  number: string;
  customerId: string;
  customer?: Customer;
  userId: string;
  user?: User;
  date: string;
  dueDate: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: Currency;
  exchangeRate: number;
  status: InvoiceStatus;
  notes: string | null;
  cae: string | null;
  caeExpiry: string | null;
  afipPtVenta: number | null;
  afipCbtNum: number | null;
  items: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceItemDTO {
  productId: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface CreateInvoiceDTO {
  type: InvoiceType;
  customerId: string;
  date?: string;
  dueDate?: string | null;
  notes?: string | null;
  currency?: Currency;
  exchangeRate?: number;
  items: CreateInvoiceItemDTO[];
}

export interface UpdateInvoiceStatusDTO {
  status: InvoiceStatus;
}

export interface PayInvoiceDTO {
  cashRegisterId: string;
}

export interface InvoiceFilters {
  page?: number;
  limit?: number;
  customerId?: string;
  type?: InvoiceType;
  status?: InvoiceStatus;
  currency?: Currency;
  startDate?: string;
  endDate?: string;
}
