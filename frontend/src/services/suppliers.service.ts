import api from './api';
import type { Supplier, CreateSupplierDTO, SupplierFilters, ApiResponse, PaginatedResponse } from '../types';

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
};

export default suppliersService;
