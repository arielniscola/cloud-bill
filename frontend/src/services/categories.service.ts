import api from './api';
import type {
  Category,
  CreateCategoryDTO,
  UpdateCategoryDTO,
  ApiResponse,
} from '../types';

export const categoriesService = {
  async getAll(): Promise<Category[]> {
    const response = await api.get<ApiResponse<Category[]>>('/categories');
    return response.data.data;
  },

  async getById(id: string): Promise<Category> {
    const response = await api.get<ApiResponse<Category>>(`/categories/${id}`);
    return response.data.data;
  },

  async create(data: CreateCategoryDTO): Promise<Category> {
    const response = await api.post<ApiResponse<Category>>('/categories', data);
    return response.data.data;
  },

  async update(id: string, data: UpdateCategoryDTO): Promise<Category> {
    const response = await api.put<ApiResponse<Category>>(`/categories/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/categories/${id}`);
  },
};

export default categoriesService;
