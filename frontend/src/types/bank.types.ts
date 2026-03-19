export interface BankAccount {
  id: string;
  name: string;
  bank: string;
  accountNumber: string | null;
  currency: string;
  balance: number;
  companyId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BankMovementType = 'CREDIT' | 'DEBIT';

export interface BankMovement {
  id: string;
  bankAccountId: string;
  type: BankMovementType;
  amount: number;
  description: string;
  date: string;
  reciboId: string | null;
  ordenPagoId: string | null;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBankAccountDTO {
  name: string;
  bank: string;
  accountNumber?: string | null;
  currency?: string;
}

export interface CreateBankMovementDTO {
  type: BankMovementType;
  amount: number;
  description: string;
  date?: string;
}
