import { Decimal } from '@prisma/client/runtime/library';

export interface BankAccount {
  id: string;
  name: string;
  bank: string;
  accountNumber: string | null;
  currency: string;
  balance: Decimal;
  companyId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  movements?: BankMovement[];
}

export interface BankMovement {
  id: string;
  bankAccountId: string;
  type: 'CREDIT' | 'DEBIT';
  amount: Decimal;
  description: string;
  date: Date;
  reciboId: string | null;
  ordenPagoId: string | null;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBankAccountInput {
  name: string;
  bank: string;
  accountNumber?: string | null;
  currency?: string;
  companyId: string;
}

export interface CreateBankMovementInput {
  bankAccountId: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  description: string;
  date?: Date;
  reciboId?: string | null;
  ordenPagoId?: string | null;
  companyId: string;
}
