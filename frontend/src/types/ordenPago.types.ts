import type { PaymentMethod } from './recibo.types';
import type { Currency } from './invoice.types';
import type { Supplier } from './supplier.types';
import type { Purchase } from './purchase.types';

export type OrdenPagoStatus = 'EMITTED' | 'CANCELLED';

export type SupplierMovementType = 'DEBIT' | 'CREDIT';

export interface OrdenPagoItem {
  id: string;
  ordenPagoId: string;
  purchaseId: string;
  amount: number;
  purchase?: Pick<Purchase, 'id' | 'number' | 'total' | 'date'> & { paidAmount: number };
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
  createdAt: string;
  updatedAt: string;
}

export interface SupplierAccountMovement {
  id: string;
  supplierId: string;
  ordenPagoId: string | null;
  purchaseId: string | null;
  type: SupplierMovementType;
  amount: number;
  currency: string;
  balance: number;
  description: string | null;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierAccount {
  balance: number;
  data: SupplierAccountMovement[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateOrdenPagoItemDTO {
  purchaseId: string;
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
