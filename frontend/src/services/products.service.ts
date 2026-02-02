import api from './api';
import type {
  Product,
  CreateProductDTO,
  UpdateProductDTO,
  ProductFilters,
  ApiResponse,
  PaginatedResponse,
} from '../types';

export const productsService = {
  async getAll(filters?: ProductFilters): Promise<PaginatedResponse<Product>> {
    const response = await api.get<PaginatedResponse<Product>>('/products', {
      params: filters,
    });
    return response.data;
  },

  async getById(id: string): Promise<Product> {
    const response = await api.get<ApiResponse<Product>>(`/products/${id}`);
    return response.data.data;
  },

  async create(data: CreateProductDTO): Promise<Product> {
    const response = await api.post<ApiResponse<Product>>('/products', data);
    return response.data.data;
  },

  async update(id: string, data: UpdateProductDTO): Promise<Product> {
    const response = await api.put<ApiResponse<Product>>(`/products/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/products/${id}`);
  },
};

export default productsService;
