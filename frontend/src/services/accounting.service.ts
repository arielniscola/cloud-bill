import api from './api';
import type { Account, JournalEntry, JournalEntryFilters, CreateJournalEntryDTO } from '../types/accounting.types';
import type { ApiResponse, PaginatedResponse } from '../types';

export const accountingService = {
  // ── Plan de Cuentas ───────────────────────────────────────────────────────

  async getAccounts(): Promise<Account[]> {
    const res = await api.get<ApiResponse<Account[]>>('/accounting/accounts');
    return res.data.data;
  },

  async seedAccounts(): Promise<Account[]> {
    const res = await api.post<ApiResponse<Account[]>>('/accounting/accounts/seed');
    return res.data.data;
  },

  // ── Asientos Contables ────────────────────────────────────────────────────

  async getJournalEntries(filters?: JournalEntryFilters): Promise<PaginatedResponse<JournalEntry>> {
    const res = await api.get<PaginatedResponse<JournalEntry>>('/accounting/journal-entries', {
      params: filters,
    });
    return res.data;
  },

  async getJournalEntryById(id: string): Promise<JournalEntry> {
    const res = await api.get<ApiResponse<JournalEntry>>(`/accounting/journal-entries/${id}`);
    return res.data.data;
  },

  async getEntriesByReference(type: string, id: string): Promise<JournalEntry[]> {
    const res = await api.get<ApiResponse<JournalEntry[]>>(
      `/accounting/journal-entries/ref/${type}/${id}`
    );
    return res.data.data;
  },

  async createJournalEntry(data: CreateJournalEntryDTO): Promise<JournalEntry> {
    const res = await api.post<ApiResponse<JournalEntry>>('/accounting/journal-entries', data);
    return res.data.data;
  },
};
