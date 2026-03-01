import api from './api';
import type { Brand, CreateBrandDTO, UpdateBrandDTO, ApiResponse } from '../types';

export const brandsService = {
  async getAll(): Promise<Brand[]> {
    const response = await api.get<ApiResponse<Brand[]>>('/brands');
    return response.data.data;
  },

  async getById(id: string): Promise<Brand> {
    const response = await api.get<ApiResponse<Brand>>(`/brands/${id}`);
    return response.data.data;
  },

  async create(data: CreateBrandDTO): Promise<Brand> {
    const response = await api.post<ApiResponse<Brand>>('/brands', data);
    return response.data.data;
  },

  async update(id: string, data: UpdateBrandDTO): Promise<Brand> {
    const response = await api.put<ApiResponse<Brand>>(`/brands/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/brands/${id}`);
  },
};

export default brandsService;
