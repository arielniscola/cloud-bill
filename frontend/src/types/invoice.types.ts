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

export type DeliveryStatus = 'NOT_DELIVERED' | 'PARTIALLY_DELIVERED' | 'DELIVERED';

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
  paymentTerms: string | null;
  saleCondition: 'CONTADO' | 'CUENTA_CORRIENTE';
  stockBehavior: 'DISCOUNT' | 'RESERVE';
  originInvoiceId: string | null;
  originInvoice?: Invoice;
  ordenPedidoId: string | null;
  cae: string | null;
  caeExpiry: string | null;
  afipPtVenta: number | null;
  afipCbtNum: number | null;
  items: InvoiceItem[];
  _count?: { items: number };
  deliveryStatus?: DeliveryStatus;
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
  paymentTerms?: string | null;
  saleCondition?: 'CONTADO' | 'CUENTA_CORRIENTE';
  stockBehavior?: 'DISCOUNT' | 'RESERVE';
  originInvoiceId?: string | null;
  currency?: Currency;
  exchangeRate?: number;
  items: CreateInvoiceItemDTO[];
}

export interface UpdateInvoiceStatusDTO {
  status: InvoiceStatus;
}

export interface PayInvoiceDTO {
  amount: number;
  paymentMethod: string;
  cashRegisterId?: string | null;
  reference?: string | null;
  bank?: string | null;
  checkDueDate?: string | null;
  installments?: number | null;
  notes?: string | null;
}

export interface InvoiceFilters {
  page?: number;
  limit?: number;
  customerId?: string;
  type?: InvoiceType;
  status?: InvoiceStatus;
  currency?: Currency;
  saleCondition?: 'CONTADO' | 'CUENTA_CORRIENTE';
  dateFrom?: string;
  dateTo?: string;
}
