import { JournalEntry, CreateJournalEntryInput } from '../entities/Accounting';

export interface JournalEntryFilters {
  companyId: string;
  referenceType?: string;
  referenceId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IJournalEntryRepository {
  create(data: CreateJournalEntryInput): Promise<JournalEntry>;
  findAll(
    pagination: { page: number; limit: number },
    filters: JournalEntryFilters
  ): Promise<{ data: JournalEntry[]; total: number; page: number; limit: number }>;
  findById(id: string): Promise<JournalEntry | null>;
  findByReference(referenceType: string, referenceId: string): Promise<JournalEntry[]>;
}
