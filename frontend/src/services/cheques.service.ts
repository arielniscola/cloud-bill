import api from './api';
import type { Cheque, CreateChequeDTO, ChequeStatus } from '../types/cheque.types';

interface ChequesResponse {
  status: string;
  data:   Cheque[];
  total:  number;
}

interface ChequeFilters {
  type?:       string;
  status?:     string;
  customerId?: string;
  supplierId?: string;
  page?:       number;
  limit?:      number;
}

const chequesService = {
  async getAll(filters: ChequeFilters = {}): Promise<{ data: Cheque[]; total: number }> {
    const res = await api.get<ChequesResponse>('/cheques', { params: filters });
    return { data: res.data.data, total: res.data.total };
  },

  async getById(id: string): Promise<Cheque> {
    const res = await api.get<{ data: Cheque }>(`/cheques/${id}`);
    return res.data.data;
  },

  async create(data: CreateChequeDTO): Promise<Cheque> {
    const res = await api.post<{ data: Cheque }>('/cheques', data);
    return res.data.data;
  },

  async updateStatus(id: string, status: ChequeStatus): Promise<Cheque> {
    const res = await api.patch<{ data: Cheque }>(`/cheques/${id}/status`, { status });
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/cheques/${id}`);
  },
};

export default chequesService;
