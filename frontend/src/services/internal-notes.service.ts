import api from './api';
import type { InternalNote, CreateInternalNoteDTO, InternalNoteFilters } from '../types';
import type { PaginatedResponse } from '../types';

const internalNotesService = {
  async getAll(filters: InternalNoteFilters = {}): Promise<{ data: InternalNote[]; total: number; totalPages: number }> {
    const params = new URLSearchParams();
    if (filters.page)       params.set('page',       String(filters.page));
    if (filters.limit)      params.set('limit',      String(filters.limit));
    if (filters.customerId) params.set('customerId', filters.customerId);
    if (filters.type)       params.set('type',       filters.type);
    if (filters.status)     params.set('status',     filters.status);
    if (filters.currency)   params.set('currency',   filters.currency);
    if (filters.dateFrom)   params.set('dateFrom',   filters.dateFrom);
    if (filters.dateTo)     params.set('dateTo',     filters.dateTo);

    const res = await api.get<PaginatedResponse<InternalNote>>(`/internal-notes?${params}`);
    return { data: res.data.data, total: res.data.total, totalPages: res.data.totalPages };
  },

  async getById(id: string): Promise<InternalNote> {
    const res = await api.get<{ data: InternalNote }>(`/internal-notes/${id}`);
    return res.data.data;
  },

  async create(dto: CreateInternalNoteDTO): Promise<InternalNote> {
    const res = await api.post<{ data: InternalNote }>('/internal-notes', dto);
    return res.data.data;
  },

  async cancel(id: string): Promise<InternalNote> {
    const res = await api.delete<{ data: InternalNote }>(`/internal-notes/${id}`);
    return res.data.data;
  },
};

export default internalNotesService;
