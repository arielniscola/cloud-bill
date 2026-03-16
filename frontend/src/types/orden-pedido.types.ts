import type { Currency } from './invoice.types';
import type { Customer } from './customer.types';

export type OrdenPedidoStatus = 'DRAFT' | 'CONFIRMED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED' | 'CONVERTED';

export interface OrdenPedidoItem {
  id: string;
  ordenPedidoId: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  product?: { id: string; name: string; sku: string } | null;
}

export interface OrdenPedido {
  id: string;
  number: string;
  customerId: string | null;
  userId: string;
  date: string;
  dueDate: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: Currency;
  exchangeRate: number;
  status: OrdenPedidoStatus;
  notes: string | null;
  paymentTerms: string | null;
  saleCondition: 'CONTADO' | 'CUENTA_CORRIENTE';
  stockBehavior: 'DISCOUNT' | 'RESERVE';
  invoiceId: string | null;
  cashRegisterId: string | null;
  invoiceCashRegisterId: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrdenPedidoItem[];
  customer?: Pick<Customer, 'id' | 'name' | 'taxId' | 'email' | 'address'> | null;
  user?: { id: string; name: string } | null;
  invoice?: { id: string; number: string; status: string } | null;
}

export interface CreateOrdenPedidoItemDTO {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface CreateOrdenPedidoDTO {
  customerId?: string | null;
  dueDate?: string | null;
  currency: Currency;
  exchangeRate: number;
  notes?: string | null;
  paymentTerms?: string | null;
  saleCondition?: 'CONTADO' | 'CUENTA_CORRIENTE';
  stockBehavior?: 'DISCOUNT' | 'RESERVE';
  cashRegisterId?: string | null;
  invoiceCashRegisterId?: string | null;
  items: CreateOrdenPedidoItemDTO[];
}

export interface UpdateOrdenPedidoStatusDTO {
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
}

export interface ConvertOrdenPedidoDTO {
  invoiceType?: string;
}

export interface PayOrdenPedidoDTO {
  amount: number;
  paymentMethod: string;
  cashRegisterId?: string | null;
  reference?: string | null;
  bank?: string | null;
  checkDueDate?: string | null;
  installments?: number | null;
  notes?: string | null;
  exchangeRate?: number;
}
