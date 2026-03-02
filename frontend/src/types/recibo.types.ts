export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHECK' | 'CARD';
export type ReciboStatus = 'EMITTED' | 'CANCELLED';

export interface Recibo {
  id: string;
  number: string;
  date: string;
  invoiceId: string | null;
  budgetId: string | null;
  customerId: string;
  userId: string;
  cashRegisterId: string | null;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  reference: string | null;
  bank: string | null;
  checkDueDate: string | null;
  installments: number | null;
  notes: string | null;
  status: ReciboStatus;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; name: string } | null;
  invoice?: { id: string; number: string; type: string } | null;
  budget?: { id: string; number: string } | null;
  cashRegister?: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
}

export interface CreateReciboDTO {
  amount: number;
  paymentMethod: PaymentMethod;
  cashRegisterId?: string | null;
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
  customerId?: string;
  status?: ReciboStatus;
  dateFrom?: string;
  dateTo?: string;
}
