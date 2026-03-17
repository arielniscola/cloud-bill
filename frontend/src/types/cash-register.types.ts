import type { Currency } from './invoice.types';

export type CashRegisterMovementType = 'DEBIT' | 'CREDIT';

export interface CashRegister {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCashRegisterDTO {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateCashRegisterDTO {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface CashRegisterMovement {
  id: string;
  currentAccountId?: string | null;
  type: CashRegisterMovementType;
  amount: number;
  balance: number;
  description: string;
  invoiceId: string | null;
  cashRegisterId: string | null;
  createdAt: string;
  currentAccount?: {
    currency: Currency;
    customer?: { id: string; name: string };
  };
  invoice?: { id: string; type: string; number: string };
}

export interface CashRegisterClose {
  id: string;
  cashRegisterId: string;
  closedAt: string;
  fromDate: string | null;
  totalIn: number;
  totalOut: number;
  netTotal: number;
  movementsCount: number;
  notes: string | null;
  userId: string | null;
  createdAt: string;
  user?: { id: string; name: string };
}

export interface CashRegisterClosePreview {
  fromDate: string | null;
  movementsCount: number;
  totalIn: number;
  totalOut: number;
  netTotal: number;
}

export interface CashRegisterMovementFilters {
  page?: number;
  limit?: number;
  type?: CashRegisterMovementType;
  startDate?: string;
  endDate?: string;
}

export interface CreateCashRegisterCloseDTO {
  notes?: string;
}
