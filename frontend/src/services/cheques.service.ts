import api from './api';
import type { Cheque, CreateChequeDTO, ChequeStatus, ChequeBounceOptions, ChequeBounceResult } from '../types/cheque.types';

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
  /** Talonario propio del que salió el cheque. */
  chequeraId?: string;
  /** N° de cheque o número interno. */
  search?:     string;
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

  /** `bounce`: al rechazar, cómo se documenta el débito al cliente/proveedor. */
  async updateStatus(
    id: string, status: ChequeStatus, bounce?: ChequeBounceOptions,
  ): Promise<{ data: Cheque; bounce: ChequeBounceResult | null }> {
    const res = await api.patch<{ data: Cheque; bounce?: ChequeBounceResult | null }>(
      `/cheques/${id}/status`, { status, ...(bounce ?? {}) },
    );
    return { data: res.data.data, bounce: res.data.bounce ?? null };
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/cheques/${id}`);
  },
};

export default chequesService;
