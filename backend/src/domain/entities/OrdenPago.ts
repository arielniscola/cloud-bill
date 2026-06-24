import { Decimal } from '@prisma/client/runtime/library';
import { Currency } from '../../shared/types';
import { PaymentMethod } from './Recibo';

export type OrdenPagoStatus = 'EMITTED' | 'PAID' | 'CANCELLED';

export interface OrdenPagoItem {
  id: string;
  ordenPagoId: string;
  purchaseId: string | null;
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

export interface OrdenPagoCheque {
  id: string;
  number: string;
  type: string;
  checkNumber: string | null;
  bank: string | null;
  amount: Decimal;
  dueDate: Date | null;
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
  amount: Decimal;
}

export interface OrdenPagoWithRelations extends OrdenPago {
  items: OrdenPagoItem[];
  supplier?: { id: string; name: string; cuit: string | null };
  user?: { id: string; name: string };
  cashRegister?: { id: string; name: string } | null;
  cheques?: OrdenPagoCheque[];
  ajustes?: OrdenPagoAjuste[];
}

export interface CreateOrdenPagoItemInput {
  purchaseInvoiceId: string;
  amount: number;
}

export interface CreateOrdenPagoChequePropioInput {
  chequeraId?: string;
  checkNumber?: string;
  bank?: string;
  amount: number;
  dueDate?: string;
}

export interface CreateOrdenPagoAjusteInput {
  accountId?: string | null;
  accountCode?: string | null;
  description: string;
  type: OrdenPagoAjusteType;
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
  amount?: number;  // pago a cuenta (sin facturas): importe explícito
  // Ajustes (descuentos / intereses) que modifican el total a pagar
  ajustes?: CreateOrdenPagoAjusteInput[];
  // Pago con cheques
  chequesEnCartera?: string[];                        // ids de cheques INGRESO a endosar
  chequesPropios?: CreateOrdenPagoChequePropioInput[]; // cheques EGRESO a emitir
}
