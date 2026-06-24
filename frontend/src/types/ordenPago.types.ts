import type { PaymentMethod } from './recibo.types';
import type { Currency } from './invoice.types';
import type { Supplier } from './supplier.types';
import type { Purchase } from './purchase.types';

export type OrdenPagoStatus = 'EMITTED' | 'PAID' | 'CANCELLED';

export type SupplierMovementType = 'DEBIT' | 'CREDIT';

export interface OrdenPagoItem {
  id: string;
  ordenPagoId: string;
  purchaseId: string | null;
  purchaseInvoiceId: string | null;
  amount: number;
  purchase?: Pick<Purchase, 'id' | 'number' | 'total' | 'date'> & { paidAmount: number };
  invoice?: { id: string; number: string; type: string; amount: number; status: string };
}

export interface PendingPurchaseInvoice {
  id: string;
  number: string;
  type: string;
  amount: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  dueDate: string | null;
  paymentMethod: string;
  purchaseId: string | null;
  purchaseNumber: string | null;
  purchaseDate: string | null;
  currency: string;
}

export interface OrdenPago {
  id: string;
  number: string;
  supplierId: string;
  supplier?: Pick<Supplier, 'id' | 'name' | 'cuit'>;
  userId: string;
  user?: { id: string; name: string };
  cashRegisterId: string | null;
  cashRegister?: { id: string; name: string } | null;
  companyId: string;
  date: string;
  amount: number;
  currency: Currency;
  exchangeRate: number;
  paymentMethod: PaymentMethod;
  reference: string | null;
  bank: string | null;
  checkDueDate: string | null;
  notes: string | null;
  status: OrdenPagoStatus;
  items: OrdenPagoItem[];
  cheques?: OrdenPagoCheque[];
  ajustes?: OrdenPagoAjuste[];
  createdAt: string;
  updatedAt: string;
}

export interface OrdenPagoCheque {
  id: string;
  number: string;
  type: string;
  checkNumber: string | null;
  bank: string | null;
  amount: number;
  dueDate: string | null;
  status: string;
}

export type OrdenPagoAjusteType = 'SUMA' | 'RESTA';

export interface OrdenPagoAjuste {
  id: string;
  ordenPagoId: string;
  accountId: string | null;
  accountCode: string | null;
  description: string;
  type: OrdenPagoAjusteType;
  amount: number;
}

export type SupplierMovementKind =
  | 'FC' | 'NC' | 'ND' | 'OP' | 'NOTE' | 'RETENTION' | 'PURCHASE' | 'OTHER';

export interface SupplierAccountMovement {
  id: string;
  supplierId: string;
  ordenPagoId: string | null;
  purchaseId: string | null;
  purchaseInvoiceId: string | null;
  type: SupplierMovementType;
  amount: number;
  currency: string;
  balance: number;
  description: string | null;
  companyId: string;
  createdAt: string;
  updatedAt: string;
  kind?: SupplierMovementKind;
  docNumber?: string | null;
}

export interface SupplierAccount {
  balance: number;
  data: SupplierAccountMovement[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SupplierMovementFilters {
  page?: number;
  limit?: number;
  type?: SupplierMovementType;
  kinds?: SupplierMovementKind[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface CreateOrdenPagoItemDTO {
  purchaseInvoiceId: string;
  amount: number;
}

export interface CreateOrdenPagoChequePropioDTO {
  chequeraId?: string;
  checkNumber?: string;
  bank?: string;
  amount: number;
  dueDate?: string;
}

export interface CreateOrdenPagoAjusteDTO {
  accountId?: string | null;
  accountCode?: string | null;
  description: string;
  type: OrdenPagoAjusteType;
  amount: number;
}

export interface CreateOrdenPagoDTO {
  supplierId: string;
  cashRegisterId?: string;
  date?: string;
  currency?: Currency;
  exchangeRate?: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  bank?: string;
  checkDueDate?: string;
  notes?: string;
  items: CreateOrdenPagoItemDTO[];
  amount?: number;  // pago a cuenta (sin facturas)
  ajustes?: CreateOrdenPagoAjusteDTO[];
  chequesEnCartera?: string[];
  chequesPropios?: CreateOrdenPagoChequePropioDTO[];
}

export interface OrdenPagoFilters {
  page?: number;
  limit?: number;
  supplierId?: string;
  status?: OrdenPagoStatus;
  paymentMethod?: PaymentMethod;
  dateFrom?: string;
  dateTo?: string;
}
