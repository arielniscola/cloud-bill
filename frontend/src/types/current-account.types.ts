import type { Customer } from './customer.types';
import type { Invoice, Currency } from './invoice.types';
import type { Budget } from './budget.types';

export type MovementType = 'DEBIT' | 'CREDIT';

export interface AccountMovement {
  id: string;
  currentAccountId: string;
  type: MovementType;
  amount: number;
  balance: number;
  description: string;
  invoiceId: string | null;
  invoice?: Invoice;
  budgetId: string | null;
  budget?: Budget;
  internalNoteId: string | null;
  createdAt: string;
}

export interface CurrentAccount {
  id: string;
  customerId: string;
  customer?: Customer;
  currency: Currency;
  balance: number;
  creditLimit: number | null;
  movements?: AccountMovement[];
  createdAt: string;
  updatedAt: string;
}

export interface RegisterPaymentDTO {
  amount: number;
  description?: string;
  currency: Currency;
}

export interface SetCreditLimitDTO {
  creditLimit: number | null;
}

export type MovementOrigin = 'INVOICE' | 'CREDIT_DEBIT_NOTE' | 'RECIBO' | 'INTERNAL_NOTE';

export interface AccountMovementFilters {
  page?: number;
  limit?: number;
  type?: MovementType;
  origin?: MovementOrigin;
  search?: string;
  startDate?: string;
  endDate?: string;
}

/** Antigüedad de la deuda de un cliente, por comprobantes impagos. */
export interface CurrentAccountAging {
  entityId: string;
  name: string;
  notDue: number;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
  docCount: number;
  /** Días de atraso del comprobante vencido más antiguo (0 si nada venció). */
  oldestDays: number;
}

export interface CurrentAccountStats {
  aging: CurrentAccountAging[];
  collectedThisMonth: { currency: string; total: number; count: number }[];
}

export interface CurrentAccountSummary {
  aging: CurrentAccountAging | null;
  avgPaymentDelayDays: number | null;
  collected90: { currency: string; total: number }[];
  invoiced90: { currency: string; total: number }[];
  lastInternalNote: { reason: string; notes: string | null; createdAt: string } | null;
}
