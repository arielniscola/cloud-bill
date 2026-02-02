import api from './api';
import type {
  Customer,
  CreateCustomerDTO,
  UpdateCustomerDTO,
  CustomerFilters,
  ApiResponse,
  PaginatedResponse,
} from '../types';

export const customersService = {
  async getAll(filters?: CustomerFilters): Promise<PaginatedResponse<Customer>> {
    const response = await api.get<PaginatedResponse<Customer>>('/customers', {
      params: filters,
    });
    return response.data;
  },

  async getById(id: string): Promise<Customer> {
    const response = await api.get<ApiResponse<Customer>>(`/customers/${id}`);
    return response.data.data;
  },

  async create(data: CreateCustomerDTO): Promise<Customer> {
    const response = await api.post<ApiResponse<Customer>>('/customers', data);
    return response.data.data;
  },

  async update(id: string, data: UpdateCustomerDTO): Promise<Customer> {
    const response = await api.put<ApiResponse<Customer>>(`/customers/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/customers/${id}`);
  },
};

export default customersService;
