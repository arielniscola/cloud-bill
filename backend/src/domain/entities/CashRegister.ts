import { Decimal } from '@prisma/client/runtime/library';

export interface CashRegister {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCashRegisterInput {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateCashRegisterInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface CashRegisterMovement {
  id: string;
  currentAccountId: string;
  type: 'DEBIT' | 'CREDIT';
  amount: Decimal;
  balance: Decimal;
  description: string;
  invoiceId: string | null;
  cashRegisterId: string | null;
  createdAt: Date;
  currentAccount?: {
    currency: string;
    customer?: { id: string; name: string };
  };
  invoice?: { id: string; type: string; number: string };
}

export interface CashRegisterClose {
  id: string;
  cashRegisterId: string;
  closedAt: Date;
  fromDate: Date | null;
  totalIn: Decimal;
  totalOut: Decimal;
  netTotal: Decimal;
  movementsCount: number;
  notes: string | null;
  userId: string | null;
  createdAt: Date;
  user?: { id: string; name: string };
}

export interface CashRegisterClosePreview {
  fromDate: Date | null;
  movementsCount: number;
  totalIn: number;
  totalOut: number;
  netTotal: number;
}

export interface CreateCashRegisterCloseInput {
  notes?: string;
  userId?: string;
}
