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
  /** Solo en movimientos manuales (retiro, depósito, aporte...). */
  cashMovement?: { id: string; number: string; concept: CashMovementConcept; status: CashMovementStatus };
}

export type CashMovementDirection = 'IN' | 'OUT';
export type CashMovementStatus = 'ACTIVE' | 'CANCELLED';
export type CashMovementConcept =
  | 'RETIRO' | 'DEPOSITO_BANCARIO' | 'GASTO' | 'APORTE' | 'FONDO_CAMBIO' | 'EXTRACCION_BANCARIA' | 'OTRO';

export interface CashMovement {
  id: string;
  cashRegisterId: string;
  number: string;
  type: CashMovementDirection;
  concept: CashMovementConcept;
  amount: number;
  personName: string | null;
  notes: string | null;
  bankAccountId: string | null;
  status: CashMovementStatus;
  cancelledAt: string | null;
  userId: string | null;
  createdAt: string;
  cashRegister?: { id: string; name: string };
  bankAccount?: { id: string; name: string; bank: string; accountNumber: string | null } | null;
  user?: { id: string; name: string } | null;
}

export interface CreateCashMovementDTO {
  type: CashMovementDirection;
  concept: CashMovementConcept;
  amount: number;
  personName?: string;
  notes?: string;
  bankAccountId?: string;
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
