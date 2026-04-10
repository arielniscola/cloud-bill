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
  createdAt: string;
  updatedAt: string;
  // UI helpers (computed)
  children?: Account[];
}

export interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  accountCode: string;
  accountId: string;
  description: string | null;
  debit: number;
  credit: number;
  account?: {
    code: string;
    name: string;
    type: AccountType;
  };
}

export interface JournalEntry {
  id: string;
  number: string;
  date: string;
  description: string;
  referenceType: JournalReferenceType | null;
  referenceId: string | null;
  companyId: string;
  userId: string | null;
  createdAt: string;
  lines?: JournalEntryLine[];
}

export interface JournalEntryFilters {
  page?: number;
  limit?: number;
  referenceType?: string;
  referenceId?: string;
  dateFrom?: string;
  dateTo?: string;
}
