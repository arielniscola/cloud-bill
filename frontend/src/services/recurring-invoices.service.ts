import api from './api';
import type {
  RecurringInvoice,
  CreateRecurringInvoiceDTO,
  UpdateRecurringInvoiceDTO,
} from '../types/recurring-invoice.types';
import type { ApiResponse, PaginatedResponse } from '../types';

export interface RecurringInvoiceFilters {
  page?: number;
  limit?: number;
  customerId?: string;
  isActive?: 'true' | 'false';
}

export const recurringInvoicesService = {
  async getAll(filters?: RecurringInvoiceFilters): Promise<PaginatedResponse<RecurringInvoice>> {
    const response = await api.get<PaginatedResponse<RecurringInvoice>>('/recurring-invoices', { params: filters });
    return response.data;
  },

  async getById(id: string): Promise<RecurringInvoice> {
    const response = await api.get<ApiResponse<RecurringInvoice>>(`/recurring-invoices/${id}`);
    return response.data.data;
  },

  async create(data: CreateRecurringInvoiceDTO): Promise<RecurringInvoice> {
    const response = await api.post<ApiResponse<RecurringInvoice>>('/recurring-invoices', data);
    return response.data.data;
  },

  async update(id: string, data: UpdateRecurringInvoiceDTO): Promise<RecurringInvoice> {
    const response = await api.put<ApiResponse<RecurringInvoice>>(`/recurring-invoices/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/recurring-invoices/${id}`);
  },

  /** Genera una factura del abono ahora (sin mover la programación). */
  async runNow(id: string): Promise<{ id: string; number: string }> {
    const response = await api.post<ApiResponse<{ id: string; number: string }>>(`/recurring-invoices/${id}/run`);
    return response.data.data;
  },
};

export default recurringInvoicesService;
