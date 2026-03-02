export type BudgetStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED' | 'EXPIRED' | 'PARTIALLY_PAID' | 'PAID';
export type Currency = 'ARS' | 'USD';
export type InvoiceType =
  | 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C'
  | 'NOTA_CREDITO_A' | 'NOTA_CREDITO_B' | 'NOTA_CREDITO_C'
  | 'NOTA_DEBITO_A' | 'NOTA_DEBITO_B' | 'NOTA_DEBITO_C';

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
  date: Date;
  validUntil: Date | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: Currency;
  exchangeRate: number;
  status: BudgetStatus;
  notes: string | null;
  paymentTerms?: string | null;
  saleCondition?: string | null;
  invoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetWithItems extends Budget {
  items: BudgetItem[];
  customer?: { id: string; name: string; taxId: string | null; email: string | null; address: string | null } | null;
  user?: { id: string; name: string } | null;
  invoice?: { id: string; number: string; status: string } | null;
}

export interface CreateBudgetItemInput {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface CreateBudgetInput {
  type: InvoiceType;
  customerId?: string | null;
  userId: string;
  validUntil?: Date | null;
  currency: Currency;
  exchangeRate: number;
  notes?: string | null;
  paymentTerms?: string | null;
  saleCondition?: string;
  items: CreateBudgetItemInput[];
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface UpdateBudgetInput extends Partial<Omit<Budget, 'id' | 'number' | 'createdAt' | 'updatedAt'>> {
  items?: CreateBudgetItemInput[];
}
