import type { InvoiceType, Currency } from './invoice.types';
import type { Supplier } from './supplier.types';

export type PurchaseStatus             = 'REGISTERED' | 'CANCELLED';
export type PurchaseInvoiceStatus      = 'PENDING' | 'PAID';

export type RetentionType = 'IIBB' | 'GANANCIAS' | 'IVA' | 'OTHER';

export interface PurchaseInvoiceItem {
  id:          string;
  description: string;
  quantity:    number;
  unitPrice:   number;
  taxRate:     number;
  subtotal:    number;
  taxAmount:   number;
  total:       number;
}

export interface PurchaseInvoiceRetencion {
  id:           string;
  type:         RetentionType;
  jurisdiction: string | null;
  base:         number;
  percentage:   number;
  amount:       number;
  certificate:  string | null;
  notes:        string | null;
}

export interface PurchaseInvoice {
  id: string;
  purchaseId: string;
  number: string;
  type: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  amount: number;          // total bruto (before retenciones)
  dueDate: string | null;
  imputationDate: string | null;
  paymentMethod: string;
  status: PurchaseInvoiceStatus;
  notes: string | null;
  items: PurchaseInvoiceItem[];
  retenciones: PurchaseInvoiceRetencion[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseInvoiceItemDTO {
  description: string;
  quantity:    number;
  unitPrice:   number;
  taxRate:     number;
}

export interface CreatePurchaseInvoiceRetentionDTO {
  type:         RetentionType;
  jurisdiction?: string | null;
  base:         number;
  percentage:   number;
  amount:       number;
  certificate?: string | null;
  notes?:       string | null;
}

export interface CreatePurchaseInvoiceDTO {
  number: string;
  type: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  amount: number;
  dueDate?: string | null;
  imputationDate?: string | null;
  paymentMethod: string;
  notes?: string | null;
  items?: CreatePurchaseInvoiceItemDTO[];
  retenciones?: CreatePurchaseInvoiceRetentionDTO[];
}
export type PurchasePaymentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID';
export type PurchaseSaleCondition = 'CONTADO' | 'CUENTA_CORRIENTE';

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface Purchase {
  id: string;
  type: InvoiceType;
  number: string;
  supplierId: string;
  supplier?: Pick<Supplier, 'id' | 'name' | 'cuit'>;
  userId: string;
  user?: { id: string; name: string; email: string };
  warehouseId: string | null;
  date: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: Currency;
  status: PurchaseStatus;
  paymentStatus: PurchasePaymentStatus;
  paidAmount: number;
  saleCondition: PurchaseSaleCondition;
  fiscalMode?: string;
  notes: string | null;
  items: PurchaseItem[];
  supplierInvoices?: PurchaseInvoice[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseItemDTO {
  productId?: string | null;
  variantId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface CreatePurchaseDTO {
  type: InvoiceType;
  number: string;
  supplierId: string;
  warehouseId?: string | null;
  date?: string;
  currency?: Currency;
  saleCondition?: PurchaseSaleCondition;
  notes?: string;
  items: CreatePurchaseItemDTO[];
}

export interface PurchaseFilters {
  page?: number;
  limit?: number;
  supplierId?: string;
  status?: PurchaseStatus;
  dateFrom?: string;
  dateTo?: string;
}
