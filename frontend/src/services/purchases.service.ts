import api from './api';
import type { Purchase, CreatePurchaseDTO, PurchaseFilters, ApiResponse, PaginatedResponse } from '../types';

export const purchasesService = {
  async getAll(filters?: PurchaseFilters): Promise<PaginatedResponse<Purchase>> {
    const response = await api.get<PaginatedResponse<Purchase>>('/purchases', { params: filters });
    return response.data;
  },

  async getById(id: string): Promise<Purchase> {
    const response = await api.get<ApiResponse<Purchase>>(`/purchases/${id}`);
    return response.data.data;
  },

  async create(data: CreatePurchaseDTO): Promise<Purchase> {
    const response = await api.post<ApiResponse<Purchase>>('/purchases', data);
    return response.data.data;
  },

  async cancel(id: string): Promise<Purchase> {
    const response = await api.post<ApiResponse<Purchase>>(`/purchases/${id}/cancel`);
    return response.data.data;
  },
};

export default purchasesService;
