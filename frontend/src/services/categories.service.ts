import api from './api';
import type { Category, CreateCategoryDTO, UpdateCategoryDTO } from '../types/category.types';

const categoriesService = {
  async getAll(): Promise<Category[]> {
    const res = await api.get<{ status: string; data: Category[] }>('/categories');
    return res.data.data;
  },

  async getById(id: string): Promise<Category> {
    const res = await api.get<{ status: string; data: Category }>(`/categories/${id}`);
    return res.data.data;
  },

  async create(data: CreateCategoryDTO): Promise<Category> {
    const res = await api.post<{ status: string; data: Category }>('/categories', data);
    return res.data.data;
  },

  async update(id: string, data: UpdateCategoryDTO): Promise<Category> {
    const res = await api.put<{ status: string; data: Category }>(`/categories/${id}`, data);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/categories/${id}`);
  },
};

export default categoriesService;
