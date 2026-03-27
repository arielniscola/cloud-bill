import { Decimal } from '@prisma/client/runtime/library';
import { Currency } from '../../shared/types';
import { PaymentMethod } from './Recibo';

export type OrdenPagoStatus = 'EMITTED' | 'PAID' | 'CANCELLED';

export interface OrdenPagoItem {
  id: string;
  ordenPagoId: string;
  purchaseId: string;
  purchaseInvoiceId: string | null;
  amount: Decimal;
  purchase?: {
    id: string;
    number: string;
    total: Decimal;
    paidAmount: Decimal;
    date: Date;
  };
  invoice?: {
    id: string;
    number: string;
    type: string;
    amount: Decimal;
    status: string;
  };
}

export interface OrdenPago {
  id: string;
  number: string;
  supplierId: string;
  userId: string;
  cashRegisterId: string | null;
  companyId: string;
  date: Date;
  amount: Decimal;
  currency: Currency;
  exchangeRate: Decimal;
  paymentMethod: PaymentMethod;
  reference: string | null;
  bank: string | null;
  checkDueDate: Date | null;
  notes: string | null;
  status: OrdenPagoStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrdenPagoWithRelations extends OrdenPago {
  items: OrdenPagoItem[];
  supplier?: { id: string; name: string; cuit: string | null };
  user?: { id: string; name: string };
  cashRegister?: { id: string; name: string } | null;
}

export interface CreateOrdenPagoItemInput {
  purchaseInvoiceId: string;
  amount: number;
}

export interface CreateOrdenPagoInput {
  supplierId: string;
  userId: string;
  cashRegisterId?: string;
  companyId?: string;
  date?: Date;
  currency?: Currency;
  exchangeRate?: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  bank?: string;
  checkDueDate?: Date;
  notes?: string;
  items: CreateOrdenPagoItemInput[];
}
