import api from './api';
import type { Recibo, ReciboFilters, ApiResponse, PaginatedResponse } from '../types';

export const recibosService = {
  async getAll(filters?: ReciboFilters): Promise<PaginatedResponse<Recibo>> {
    const response = await api.get<PaginatedResponse<Recibo>>('/recibos', { params: filters });
    return response.data;
  },

  async getById(id: string): Promise<Recibo> {
    const response = await api.get<ApiResponse<Recibo>>(`/recibos/${id}`);
    return response.data.data;
  },

  async cancel(id: string): Promise<Recibo> {
    const response = await api.delete<ApiResponse<Recibo>>(`/recibos/${id}`);
    return response.data.data;
  },
};

export default recibosService;
