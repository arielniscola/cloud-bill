import api from './api';
import type {
  CarteraCheque, ChequeEgreso, ChequeEgresoReason, CreateChequeEgresoDTO,
} from '../types/cheque.types';

export interface ChequeEgresoFilters {
  search?:   string;
  reasonId?: string;
  status?:   'ACTIVE' | 'CANCELLED';
  dateFrom?: string;
  dateTo?:   string;
  page?:     number;
  limit?:    number;
}

/** Egreso de cheques en cartera + catálogo de motivos. */
const chequeEgresosService = {
  /** Cheques en cartera (manuales y de cobranzas), buscando por N°, banco, librador o monto. */
  async cartera(search = ''): Promise<CarteraCheque[]> {
    const res = await api.get<{ data: CarteraCheque[] }>('/cheques/cartera', { params: search ? { search } : undefined });
    return res.data.data;
  },

  async list(filters: ChequeEgresoFilters = {}): Promise<{ data: ChequeEgreso[]; total: number; totalPages: number }> {
    const res = await api.get<{ data: ChequeEgreso[]; total: number; totalPages: number }>('/cheques/egresos', { params: filters });
    return { data: res.data.data, total: res.data.total, totalPages: res.data.totalPages };
  },

  async create(data: CreateChequeEgresoDTO): Promise<ChequeEgreso> {
    const res = await api.post<{ data: ChequeEgreso }>('/cheques/egresos', data);
    return res.data.data;
  },

  async cancel(id: string, reason?: string): Promise<ChequeEgreso> {
    const res = await api.post<{ data: ChequeEgreso }>(`/cheques/egresos/${id}/cancel`, { reason: reason || null });
    return res.data.data;
  },

  async getReasons(all = false): Promise<ChequeEgresoReason[]> {
    const res = await api.get<{ data: ChequeEgresoReason[] }>('/cheque-egreso-reasons', { params: all ? { all: true } : undefined });
    return res.data.data;
  },

  async createReason(name: string): Promise<ChequeEgresoReason> {
    const res = await api.post<{ data: ChequeEgresoReason }>('/cheque-egreso-reasons', { name });
    return res.data.data;
  },

  async updateReason(id: string, data: { name?: string; isActive?: boolean }): Promise<ChequeEgresoReason> {
    const res = await api.put<{ data: ChequeEgresoReason }>(`/cheque-egreso-reasons/${id}`, data);
    return res.data.data;
  },

  async deleteReason(id: string): Promise<{ deleted: boolean; deactivated: boolean }> {
    const res = await api.delete<{ data: { deleted: boolean; deactivated: boolean } }>(`/cheque-egreso-reasons/${id}`);
    return res.data.data;
  },
};

export default chequeEgresosService;
