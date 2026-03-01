import api from './api';
import type {
  Budget,
  CreateBudgetDTO,
  UpdateBudgetStatusDTO,
  ConvertBudgetDTO,
  ApiResponse,
  PaginatedResponse,
} from '../types';

export interface BudgetFilters {
  page?: number;
  limit?: number;
  customerId?: string;
  status?: string;
  currency?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const budgetsService = {
  async getAll(filters?: BudgetFilters): Promise<PaginatedResponse<Budget>> {
    const response = await api.get<PaginatedResponse<Budget>>('/budgets', { params: filters });
    return response.data;
  },

  async getById(id: string): Promise<Budget> {
    const response = await api.get<ApiResponse<Budget>>(`/budgets/${id}`);
    return response.data.data;
  },

  async create(data: CreateBudgetDTO): Promise<Budget> {
    const response = await api.post<ApiResponse<Budget>>('/budgets', data);
    return response.data.data;
  },

  async update(id: string, data: CreateBudgetDTO): Promise<Budget> {
    const response = await api.put<ApiResponse<Budget>>(`/budgets/${id}`, data);
    return response.data.data;
  },

  async updateStatus(id: string, data: UpdateBudgetStatusDTO): Promise<Budget> {
    const response = await api.patch<ApiResponse<Budget>>(`/budgets/${id}/status`, data);
    return response.data.data;
  },

  async convertToInvoice(id: string, data?: ConvertBudgetDTO): Promise<{ id: string; number: string; status: string }> {
    const response = await api.post<ApiResponse<any>>(`/budgets/${id}/convert`, data ?? {});
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/budgets/${id}`);
  },
};

export default budgetsService;
