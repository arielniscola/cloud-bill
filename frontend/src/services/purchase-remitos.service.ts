import api from './api';
import type { ApiResponse, PaginatedResponse } from '../types';
import type {
  PurchaseRemito,
  CreatePurchaseRemitoDTO,
  PurchaseRemitoFilters,
} from '../types/purchase-remito.types';

export const purchaseRemitosService = {
  async getAll(filters?: PurchaseRemitoFilters): Promise<PaginatedResponse<PurchaseRemito>> {
    const response = await api.get<PaginatedResponse<PurchaseRemito>>('/purchase-remitos', { params: filters });
    return response.data;
  },

  async getById(id: string): Promise<PurchaseRemito> {
    const response = await api.get<ApiResponse<PurchaseRemito>>(`/purchase-remitos/${id}`);
    return response.data.data;
  },

  async create(data: CreatePurchaseRemitoDTO): Promise<PurchaseRemito> {
    const response = await api.post<ApiResponse<PurchaseRemito>>('/purchase-remitos', data);
    return response.data.data;
  },

  async cancel(id: string): Promise<PurchaseRemito> {
    const response = await api.post<ApiResponse<PurchaseRemito>>(`/purchase-remitos/${id}/cancel`);
    return response.data.data;
  },

  async updateNumber(id: string, number: string): Promise<PurchaseRemito> {
    const response = await api.patch<ApiResponse<PurchaseRemito>>(`/purchase-remitos/${id}/number`, { number });
    return response.data.data;
  },
};

export default purchaseRemitosService;
