import api from './api';
import type {
  OrdenPedido,
  CreateOrdenPedidoDTO,
  UpdateOrdenPedidoStatusDTO,
  ConvertOrdenPedidoDTO,
  PayOrdenPedidoDTO,
} from '../types';
import type { ApiResponse, PaginatedResponse } from '../types';

export interface OrdenPedidoFilters {
  page?: number;
  limit?: number;
  customerId?: string;
  status?: string;
  currency?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const ordenPedidosService = {
  async getAll(filters?: OrdenPedidoFilters): Promise<PaginatedResponse<OrdenPedido>> {
    const response = await api.get<PaginatedResponse<OrdenPedido>>('/orden-pedidos', { params: filters });
    return response.data;
  },

  async getById(id: string): Promise<OrdenPedido> {
    const response = await api.get<ApiResponse<OrdenPedido>>(`/orden-pedidos/${id}`);
    return response.data.data;
  },

  async create(data: CreateOrdenPedidoDTO): Promise<OrdenPedido> {
    const response = await api.post<ApiResponse<OrdenPedido>>('/orden-pedidos', data);
    return response.data.data;
  },

  async update(id: string, data: CreateOrdenPedidoDTO): Promise<OrdenPedido> {
    const response = await api.put<ApiResponse<OrdenPedido>>(`/orden-pedidos/${id}`, data);
    return response.data.data;
  },

  async updateStatus(id: string, data: UpdateOrdenPedidoStatusDTO): Promise<OrdenPedido> {
    const response = await api.patch<ApiResponse<OrdenPedido>>(`/orden-pedidos/${id}/status`, data);
    return response.data.data;
  },

  async convertToInvoice(id: string, data?: ConvertOrdenPedidoDTO): Promise<{ id: string; number: string; status: string }> {
    const response = await api.post<ApiResponse<any>>(`/orden-pedidos/${id}/convert`, data ?? {});
    return response.data.data;
  },

  async pay(id: string, data: PayOrdenPedidoDTO): Promise<OrdenPedido> {
    const response = await api.post<ApiResponse<OrdenPedido>>(`/orden-pedidos/${id}/pay`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/orden-pedidos/${id}`);
  },
};

export default ordenPedidosService;
