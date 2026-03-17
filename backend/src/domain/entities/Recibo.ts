import { Decimal } from '@prisma/client/runtime/library';

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHECK' | 'CARD' | 'MERCADO_PAGO';
export type ReciboStatus = 'EMITTED' | 'CANCELLED';

export interface Recibo {
  id: string;
  number: string;
  date: Date;
  invoiceId: string | null;
  budgetId: string | null;
  ordenPedidoId: string | null;
  customerId: string;
  userId: string;
  cashRegisterId: string | null;
  amount: Decimal;
  currency: string;
  exchangeRate: Decimal;
  paymentMethod: PaymentMethod;
  reference: string | null;
  bank: string | null;
  checkDueDate: Date | null;
  installments: number | null;
  notes: string | null;
  status: ReciboStatus;
  checkStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReciboWithRelations extends Recibo {
  customer?: { id: string; name: string } | null;
  invoice?: { id: string; number: string; type: string } | null;
  budget?: { id: string; number: string } | null;
  ordenPedido?: { id: string; number: string } | null;
  cashRegister?: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
}

export interface CreateReciboInput {
  invoiceId?: string | null;
  budgetId?: string | null;
  ordenPedidoId?: string | null;
  customerId: string;
  userId: string;
  cashRegisterId?: string | null;
  amount: number;
  currency: string;
  exchangeRate?: number;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  bank?: string | null;
  checkDueDate?: Date | null;
  installments?: number | null;
  notes?: string | null;
  companyId?: string;
}
