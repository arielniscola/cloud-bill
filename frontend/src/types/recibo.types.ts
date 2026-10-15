// COMPENSACION = aplicación de saldo a favor (NC, NC interna, pago a cuenta): no mueve plata.
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MERCADO_PAGO' | 'CHECK' | 'CARD' | 'COMPENSACION';
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
  cardId: string | null;
  surchargePercent: number | null;
  surchargeAmount: number | null;
  /** Descuento cedido / recargo aplicados al cobrar (aplicado = amount + discount − interest). */
  discountAmount?: number;
  interestAmount?: number;
  /** Compensación: NC o movimiento de saldo a favor que se aplicó. */
  creditInvoiceId?: string | null;
  creditMovementId?: string | null;
  fiscalMode?: string;
  createdAt: string;
  updatedAt: string;
  // El detalle (GET /recibos/:id) trae además los datos de impresión.
  customer?: {
    id: string; name: string; code?: number | null; taxId?: string | null; taxCondition?: string;
    address?: string | null; city?: string | null; province?: string | null;
    postalCode?: string | null; phone?: string | null; email?: string | null;
  } | null;
  invoice?: {
    id: string; number: string; type: string; date?: string; total?: number; currency?: string;
    afipPtVenta?: number | null; afipCbtNum?: number | null;
  } | null;
  budget?: { id: string; number: string; date?: string; total?: number } | null;
  ordenPedido?: { id: string; number: string; date?: string; total?: number } | null;
  cashRegister?: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
  card?: { id: string; name: string; type: string } | null;
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
  cardId?: string | null;
  surchargePercent?: number | null;
  surchargeAmount?: number | null;
  discountAmount?: number;
  interestAmount?: number;
  creditInvoiceId?: string | null;
  creditMovementId?: string | null;
}

/** Saldo a favor del cliente aplicable a facturas. */
export interface CustomerCredit {
  source: 'INVOICE' | 'MOVEMENT';
  creditInvoiceId?: string;
  creditMovementId?: string;
  number: string;
  description: string;
  date: string;
  currency: string;
  inCurrentAccount: boolean;
  amount: number;
  used: number;
  balance: number;
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
