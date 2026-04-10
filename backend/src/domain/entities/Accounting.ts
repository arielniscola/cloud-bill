export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export type JournalReferenceType = 'INVOICE' | 'PAYMENT' | 'PURCHASE' | 'MANUAL';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentCode: string | null;
  level: number;
  isAuxiliary: boolean;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  accountCode: string;
  accountId: string;
  description: string | null;
  debit: number;
  credit: number;
  account?: Pick<Account, 'code' | 'name' | 'type'>;
}

export interface JournalEntry {
  id: string;
  number: string;
  date: Date;
  description: string;
  referenceType: JournalReferenceType | null;
  referenceId: string | null;
  companyId: string;
  userId: string | null;
  createdAt: Date;
  lines?: JournalEntryLine[];
}

export interface CreateAccountInput {
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string | null;
  level: number;
  isAuxiliary?: boolean;
  companyId: string;
}

export interface CreateJournalEntryInput {
  date?: Date;
  description: string;
  referenceType?: JournalReferenceType;
  referenceId?: string;
  companyId: string;
  userId?: string;
  lines: {
    accountCode: string;
    description?: string;
    debit: number;
    credit: number;
  }[];
}
