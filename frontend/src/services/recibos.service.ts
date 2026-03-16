import api from './api';
import type { Recibo, ReciboFilters, CheckFilters, CheckStatus, ApiResponse, PaginatedResponse } from '../types';

export const recibosService = {
  async getAll(filters?: ReciboFilters): Promise<PaginatedResponse<Recibo>> {
    const response = await api.get<PaginatedResponse<Recibo>>('/recibos', { params: filters });
    return response.data;
  },

  async getById(id: string): Promise<Recibo> {
    const response = await api.get<ApiResponse<Recibo>>(`/recibos/${id}`);
    return response.data.data;
  },

  async getChecks(filters?: CheckFilters): Promise<PaginatedResponse<Recibo>> {
    const response = await api.get<PaginatedResponse<Recibo>>('/recibos/checks/list', { params: filters });
    return response.data;
  },

  async updateCheckStatus(id: string, checkStatus: CheckStatus): Promise<Recibo> {
    const response = await api.patch<ApiResponse<Recibo>>(`/recibos/${id}/check-status`, { checkStatus });
    return response.data.data;
  },

  async cancel(id: string): Promise<Recibo> {
    const response = await api.delete<ApiResponse<Recibo>>(`/recibos/${id}`);
    return response.data.data;
  },
};

export default recibosService;
