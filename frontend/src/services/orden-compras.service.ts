import api from './api';
import type { OrdenCompra, CreateOrdenCompraDTO, OrdenCompraFilters, OrdenCompraStatus, ApiResponse, PaginatedResponse } from '../types';

export const ordenComprasService = {
  async getAll(filters?: OrdenCompraFilters): Promise<PaginatedResponse<OrdenCompra>> {
    const response = await api.get<PaginatedResponse<OrdenCompra>>('/orden-compras', { params: filters });
    return response.data;
  },

  async getById(id: string): Promise<OrdenCompra> {
    const response = await api.get<ApiResponse<OrdenCompra>>(`/orden-compras/${id}`);
    return response.data.data;
  },

  async create(data: CreateOrdenCompraDTO): Promise<OrdenCompra> {
    const response = await api.post<ApiResponse<OrdenCompra>>('/orden-compras', data);
    return response.data.data;
  },

  async update(id: string, data: Partial<CreateOrdenCompraDTO>): Promise<OrdenCompra> {
    const response = await api.put<ApiResponse<OrdenCompra>>(`/orden-compras/${id}`, data);
    return response.data.data;
  },

  async updateStatus(id: string, status: Exclude<OrdenCompraStatus, 'RECEIVED'>): Promise<OrdenCompra> {
    const response = await api.patch<ApiResponse<OrdenCompra>>(`/orden-compras/${id}/status`, { status });
    return response.data.data;
  },

  async convert(id: string): Promise<{ ordenCompra: OrdenCompra; purchase: any }> {
    const response = await api.post<ApiResponse<{ ordenCompra: OrdenCompra; purchase: any }>>(`/orden-compras/${id}/convert`);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/orden-compras/${id}`);
  },
};

export default ordenComprasService;
