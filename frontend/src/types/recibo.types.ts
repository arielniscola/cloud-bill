export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MERCADO_PAGO' | 'CHECK' | 'CARD';
export type ReciboStatus = 'EMITTED' | 'CANCELLED';
export type CheckStatus = 'PENDING' | 'DEPOSITED' | 'CLEARED' | 'BOUNCED' | 'RETURNED';

export interface Recibo {
  id: string;
  number: string;
  date: string;
  invoiceId: string | null;
  budgetId: string | null;
  ordenPedidoId: string | null;
  customerId: string;
  userId: string;
  cashRegisterId: string | null;
  bankAccountId: string | null;
  amount: number;
  currency: string;
  exchangeRate: number;
  paymentMethod: PaymentMethod;
  reference: string | null;
  bank: string | null;
  checkDueDate: string | null;
  installments: number | null;
  notes: string | null;
  status: ReciboStatus;
  checkStatus: CheckStatus | null;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; name: string } | null;
  invoice?: { id: string; number: string; type: string } | null;
  budget?: { id: string; number: string } | null;
  ordenPedido?: { id: string; number: string } | null;
  cashRegister?: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
}

export interface CreateReciboDTO {
  amount: number;
  exchangeRate?: number;
  paymentMethod: PaymentMethod;
  cashRegisterId?: string | null;
  bankAccountId?: string | null;
  reference?: string | null;
  bank?: string | null;
  checkDueDate?: string | null;
  installments?: number | null;
  notes?: string | null;
}

export interface ReciboFilters {
  page?: number;
  limit?: number;
  invoiceId?: string;
  budgetId?: string;
  ordenPedidoId?: string;
  customerId?: string;
  status?: ReciboStatus;
  paymentMethod?: PaymentMethod;
  dateFrom?: string;
  dateTo?: string;
}

export interface CheckFilters {
  page?: number;
  limit?: number;
  customerId?: string;
  checkStatus?: CheckStatus;
  dueDateFrom?: string;
  dueDateTo?: string;
  dateFrom?: string;
  dateTo?: string;
}
