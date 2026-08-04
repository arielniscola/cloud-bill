import api from './api';
import type { Supplier, SupplierProductStat, CreateSupplierDTO, SupplierFilters, ApiResponse, PaginatedResponse } from '../types';
import type { SupplierRetention, CreateSupplierRetentionDTO } from '../types/supplier.types';

export const suppliersService = {
  async getAll(filters?: SupplierFilters): Promise<PaginatedResponse<Supplier>> {
    const response = await api.get<PaginatedResponse<Supplier>>('/suppliers', { params: filters });
    return response.data;
  },

  async getById(id: string): Promise<Supplier> {
    const response = await api.get<ApiResponse<Supplier>>(`/suppliers/${id}`);
    return response.data.data;
  },

  async create(data: CreateSupplierDTO): Promise<Supplier> {
    const response = await api.post<ApiResponse<Supplier>>('/suppliers', data);
    return response.data.data;
  },

  async update(id: string, data: Partial<CreateSupplierDTO>): Promise<Supplier> {
    const response = await api.put<ApiResponse<Supplier>>(`/suppliers/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/suppliers/${id}`);
  },

  async getProducts(id: string): Promise<SupplierProductStat[]> {
    const response = await api.get<ApiResponse<SupplierProductStat[]>>(`/suppliers/${id}/products`);
    return response.data.data;
  },

  // ── Retenciones configuradas (se aplican al emitir la Orden de Pago) ──
  async getRetentions(id: string, onlyActive = false): Promise<SupplierRetention[]> {
    const response = await api.get<ApiResponse<SupplierRetention[]>>(`/suppliers/${id}/retentions`, {
      params: onlyActive ? { isActive: true } : undefined,
    });
    return response.data.data;
  },

  async createRetention(id: string, data: CreateSupplierRetentionDTO): Promise<SupplierRetention> {
    const response = await api.post<ApiResponse<SupplierRetention>>(`/suppliers/${id}/retentions`, data);
    return response.data.data;
  },

  async updateRetention(id: string, retentionId: string, data: Partial<CreateSupplierRetentionDTO>): Promise<SupplierRetention> {
    const response = await api.put<ApiResponse<SupplierRetention>>(`/suppliers/${id}/retentions/${retentionId}`, data);
    return response.data.data;
  },

  async deleteRetention(id: string, retentionId: string): Promise<void> {
    await api.delete(`/suppliers/${id}/retentions/${retentionId}`);
  },
};

export default suppliersService;
