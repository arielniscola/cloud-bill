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
  currentAccountId?: string | null;
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
  /** Solo en movimientos manuales (retiro, depósito, aporte...). */
  cashMovement?: { id: string; number: string; concept: string; status: string };
}

export interface CashMovement {
  id: string;
  companyId: string;
  cashRegisterId: string;
  number: string;
  type: 'IN' | 'OUT';
  concept: string;
  amount: Decimal;
  personName: string | null;
  notes: string | null;
  bankAccountId: string | null;
  status: 'ACTIVE' | 'CANCELLED';
  cancelledAt: Date | null;
  userId: string | null;
  fiscalMode: string;
  createdAt: Date;
  updatedAt: Date;
  cashRegister?: { id: string; name: string };
  bankAccount?: { id: string; name: string; bank: string; accountNumber: string | null } | null;
  user?: { id: string; name: string } | null;
}

export interface CreateCashMovementInput {
  companyId: string;
  cashRegisterId: string;
  type: 'IN' | 'OUT';
  concept: string;
  amount: number;
  personName?: string | null;
  notes?: string | null;
  bankAccountId?: string | null;
  userId?: string;
  fiscalMode: string;
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
