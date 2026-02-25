import api from './api';
import type {
  Invoice,
  CreateInvoiceDTO,
  UpdateInvoiceStatusDTO,
  PayInvoiceDTO,
  InvoiceFilters,
  ApiResponse,
  PaginatedResponse,
} from '../types';

export const invoicesService = {
  async getAll(filters?: InvoiceFilters): Promise<PaginatedResponse<Invoice>> {
    const response = await api.get<PaginatedResponse<Invoice>>('/invoices', {
      params: filters,
    });
    return response.data;
  },

  async getById(id: string): Promise<Invoice> {
    const response = await api.get<ApiResponse<Invoice>>(`/invoices/${id}`);
    return response.data.data;
  },

  async create(data: CreateInvoiceDTO): Promise<Invoice> {
    const response = await api.post<ApiResponse<Invoice>>('/invoices', data);
    return response.data.data;
  },

  async update(id: string, data: CreateInvoiceDTO): Promise<Invoice> {
    const response = await api.put<ApiResponse<Invoice>>(`/invoices/${id}`, data);
    return response.data.data;
  },

  async updateStatus(id: string, data: UpdateInvoiceStatusDTO): Promise<Invoice> {
    const response = await api.patch<ApiResponse<Invoice>>(
      `/invoices/${id}/status`,
      data
    );
    return response.data.data;
  },

  async pay(id: string, data: PayInvoiceDTO): Promise<Invoice> {
    const response = await api.post<ApiResponse<Invoice>>(
      `/invoices/${id}/pay`,
      data
    );
    return response.data.data;
  },

  async cancel(id: string): Promise<Invoice> {
    const response = await api.post<ApiResponse<Invoice>>(
      `/invoices/${id}/cancel`
    );
    return response.data.data;
  },
};

export default invoicesService;
