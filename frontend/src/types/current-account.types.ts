import type { Customer } from './customer.types';
import type { Invoice, Currency } from './invoice.types';

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

export interface AccountMovementFilters {
  page?: number;
  limit?: number;
  type?: MovementType;
  startDate?: string;
  endDate?: string;
}
