export type RecurringFrequency =
  | 'WEEKLY'
  | 'MONTHLY'
  | 'BIMONTHLY'
  | 'QUARTERLY'
  | 'SEMIANNUAL'
  | 'YEARLY';

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
  type: string;
  currency: string;
  exchangeRate: number;
  saleCondition: string;
  paymentTerms: string | null;
  stockBehavior: string;
  warehouseId: string | null;
  notes: string | null;
  frequency: RecurringFrequency;
  dayOfMonth: number | null;
  useCurrentPrices: boolean;
  startDate: Date;
  endDate: Date | null;
  nextRunAt: Date;
  lastRunAt: Date | null;
  generatedCount: number;
  isActive: boolean;
  companyId: string;
  fiscalMode: string;
  createdAt: Date;
  updatedAt: Date;
  customer?: { id: string; name: string; taxId: string | null } | null;
  items?: RecurringInvoiceItem[];
}

export interface CreateRecurringInvoiceInput {
  name: string;
  customerId: string;
  userId: string;
  type: string;
  currency?: string;
  exchangeRate?: number;
  saleCondition?: string;
  paymentTerms?: string | null;
  stockBehavior?: string;
  warehouseId?: string | null;
  notes?: string | null;
  frequency: RecurringFrequency;
  dayOfMonth?: number | null;
  useCurrentPrices?: boolean;
  startDate: Date;
  endDate?: Date | null;
  nextRunAt: Date;
  companyId?: string;
  fiscalMode?: string;
  items: Array<{
    productId: string;
    variantId?: string | null;
    quantity: number;
    unitPrice: number;
    discountPct?: number;
    taxRate?: number;
  }>;
}
