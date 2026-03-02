import type { Currency, InvoiceType, DeliveryStatus } from './invoice.types';
import type { Customer } from './customer.types';

export type BudgetStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED' | 'EXPIRED' | 'PARTIALLY_PAID' | 'PAID';

export interface BudgetItem {
  id: string;
  budgetId: string;
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

export interface Budget {
  id: string;
  number: string;
  type: InvoiceType;
  customerId: string | null;
  userId: string;
  date: string;
  validUntil: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: Currency;
  exchangeRate: number;
  status: BudgetStatus;
  notes: string | null;
  paymentTerms: string | null;
  saleCondition: 'CONTADO' | 'CUENTA_CORRIENTE';
  invoiceId: string | null;
  deliveryStatus?: DeliveryStatus;
  createdAt: string;
  updatedAt: string;
  items: BudgetItem[];
  customer?: Pick<Customer, 'id' | 'name' | 'taxId' | 'email' | 'address'> | null;
  user?: { id: string; name: string } | null;
  invoice?: { id: string; number: string; status: string } | null;
}

export interface CreateBudgetItemDTO {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface CreateBudgetDTO {
  type: InvoiceType;
  customerId?: string | null;
  validUntil?: string | null;
  currency: Currency;
  exchangeRate: number;
  notes?: string | null;
  paymentTerms?: string | null;
  saleCondition?: 'CONTADO' | 'CUENTA_CORRIENTE';
  items: CreateBudgetItemDTO[];
}

export interface UpdateBudgetStatusDTO {
  status: BudgetStatus;
}

export interface ConvertBudgetDTO {
  invoiceType?: string;
}

export interface PayBudgetDTO {
  amount: number;
  paymentMethod: string;
  cashRegisterId?: string | null;
  reference?: string | null;
  bank?: string | null;
  checkDueDate?: string | null;
  installments?: number | null;
  notes?: string | null;
}
