import type { InvoiceType, Currency } from './invoice.types';
import type { Supplier } from './supplier.types';

export type PurchaseStatus             = 'REGISTERED' | 'CANCELLED';
export type PurchaseInvoiceStatus      = 'PENDING' | 'PARTIALLY_PAID' | 'PAID';

export type RetentionType = 'IIBB' | 'GANANCIAS' | 'IVA' | 'SUSS' | 'OTHER';

// "Otros tributos" que SUMAN al total (percepciones, impuestos internos, otros)
export type TributoType = 'PERCEPCION_IVA' | 'PERCEPCION_IIBB' | 'IMPUESTOS_INTERNOS' | 'OTRO';

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

export interface PurchaseInvoiceTributo {
  id:           string;
  type:         TributoType;
  jurisdiction: string | null;
  base:         number;
  percentage:   number;
  amount:       number;
  description:  string | null;
}

export interface PurchaseInvoiceRemitoLink {
  id: string;
  number: string;
  date: string;
  status: string;
}

export interface PurchaseInvoice {
  id: string;
  purchaseId: string | null;           // legacy: compra vinculada (opcional)
  supplierId: string | null;
  supplier?: Pick<Supplier, 'id' | 'name' | 'cuit'>;
  number: string;
  type: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  amount: number;          // total del comprobante (neto + IVA + otros tributos)
  paidAmount?: number;     // suma de OP pagadas que imputan a esta factura (computado en el listado)
  currency: string;
  exchangeRate?: number;
  saleCondition: PurchaseSaleCondition;
  date: string;
  dueDate: string | null;
  imputationDate: string | null;
  paymentMethod: string;
  status: PurchaseInvoiceStatus;
  notes: string | null;
  items: PurchaseInvoiceItem[];
  tributos: PurchaseInvoiceTributo[];
  remitos?: PurchaseInvoiceRemitoLink[];
  originInvoiceId?: string | null;
  originInvoice?: { id: string; number: string; type: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseInvoiceItemDTO {
  description: string;
  quantity:    number;
  unitPrice:   number;
  taxRate:     number;
}

export interface CreatePurchaseInvoiceTributoDTO {
  type:         TributoType;
  jurisdiction?: string | null;
  base:         number;
  percentage:   number;
  amount:       number;
  description?: string | null;
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
  tributos?: CreatePurchaseInvoiceTributoDTO[];
  // Standalone (documento de primer nivel)
  supplierId?: string;
  currency?: string;
  saleCondition?: 'CONTADO' | 'CUENTA_CORRIENTE';
  exchangeRate?: number;
  date?: string | null;
  remitoIds?: string[];
  originInvoiceId?: string | null;
}

export interface PurchaseInvoiceFilters {
  page?: number;
  limit?: number;
  supplierId?: string;
  status?: PurchaseInvoiceStatus;
  search?: string;
  currency?: string;
  saleCondition?: 'CONTADO' | 'CUENTA_CORRIENTE';
  type?: string;
  dateFrom?: string;
  dateTo?: string;
}
// Retención practicada al pagar, enriquecida con la orden de pago y el proveedor
// (listado / reimpresión de comprobantes — GET /purchase-invoices/retenciones).
export interface PurchaseInvoiceRetentionRow {
  id: string;
  // Las retenciones solo se practican al pagar (Orden de Pago), que es el
  // momento que corresponde legalmente.
  origin: 'ORDEN_PAGO';
  type: RetentionType;
  jurisdiction: string | null;
  base: number;                        // importe de la base
  baseKind: 'NETO' | 'IVA' | 'BRUTO' | null;
  percentage: number;
  amount: number;
  certificate: string | null;
  notes: string | null;
  createdAt: string;
  // Comprobante de origen: la orden de pago.
  invoice: { id: string; number: string; date: string; currency: string };
  supplier: { id: string; name: string; cuit: string | null };
}

export interface PurchaseInvoiceRetentionFilters {
  page?: number;
  limit?: number;
  supplierId?: string;
  type?: RetentionType;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
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
  exchangeRate?: number;
  status: PurchaseStatus;
  paymentStatus: PurchasePaymentStatus;
  paidAmount: number;
  saleCondition: PurchaseSaleCondition;
  fiscalMode?: string;
  notes: string | null;
  originPurchaseId?: string | null;
  originPurchase?: { id: string; number: string; type: InvoiceType } | null;
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
  exchangeRate?: number;
  saleCondition?: PurchaseSaleCondition;
  notes?: string;
  originPurchaseId?: string | null;
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
