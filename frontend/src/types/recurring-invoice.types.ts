import type { Currency } from './invoice.types';

export type RecurringFrequency =
  | 'WEEKLY'
  | 'MONTHLY'
  | 'BIMONTHLY'
  | 'QUARTERLY'
  | 'SEMIANNUAL'
  | 'YEARLY';

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensual',
  BIMONTHLY: 'Bimestral',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  YEARLY: 'Anual',
};

export interface RecurringInvoiceItem {
  id: string;
  recurringInvoiceId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxRate: number;
  product?: { id: string; name: string; sku: string; price: number } | null;
}

export interface RecurringInvoice {
  id: string;
  name: string;
  customerId: string;
  userId: string;
  type: 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C';
  currency: Currency;
  exchangeRate: number;
  saleCondition: 'CONTADO' | 'CUENTA_CORRIENTE';
  paymentTerms: string | null;
  stockBehavior: 'DISCOUNT' | 'RESERVE';
  warehouseId: string | null;
  notes: string | null;
  frequency: RecurringFrequency;
  dayOfMonth: number | null;
  useCurrentPrices: boolean;
  startDate: string;
  endDate: string | null;
  nextRunAt: string;
  lastRunAt: string | null;
  generatedCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; name: string; taxId: string | null } | null;
  items?: RecurringInvoiceItem[];
  itemCount?: number;
}

export interface CreateRecurringInvoiceItemDTO {
  productId: string;
  variantId?: string | null;
  quantity: number;
  unitPrice: number;
  discountPct?: number;
  taxRate?: number;
}

export interface CreateRecurringInvoiceDTO {
  name: string;
  customerId: string;
  type: 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C';
  currency?: Currency;
  exchangeRate?: number;
  saleCondition?: 'CONTADO' | 'CUENTA_CORRIENTE';
  paymentTerms?: string | null;
  stockBehavior?: 'DISCOUNT' | 'RESERVE';
  warehouseId?: string | null;
  notes?: string | null;
  frequency: RecurringFrequency;
  dayOfMonth?: number | null;
  useCurrentPrices?: boolean;
  startDate: string;
  endDate?: string | null;
  items: CreateRecurringInvoiceItemDTO[];
}

export type UpdateRecurringInvoiceDTO = Partial<CreateRecurringInvoiceDTO> & { isActive?: boolean };
