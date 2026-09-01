import api from './api';
import type {
  PurchaseInvoice, CreatePurchaseInvoiceDTO, PurchaseInvoiceFilters, PurchaseInvoiceSummary,
  PurchaseInvoiceRetentionRow, PurchaseInvoiceRetentionFilters,
  ApiResponse, PaginatedResponse,
} from '../types';

// El listado devuelve además los totales de la consulta completa.
export type PurchaseInvoiceListResponse = PaginatedResponse<PurchaseInvoice> & {
  summary: PurchaseInvoiceSummary;
};

export const purchaseInvoicesService = {
  async getAll(filters?: PurchaseInvoiceFilters): Promise<PurchaseInvoiceListResponse> {
    const response = await api.get<PurchaseInvoiceListResponse>('/purchase-invoices', { params: filters });
    return response.data;
  },

  async getById(id: string): Promise<PurchaseInvoice> {
    const response = await api.get<ApiResponse<PurchaseInvoice>>(`/purchase-invoices/${id}`);
    return response.data.data;
  },

  async create(data: CreatePurchaseInvoiceDTO): Promise<PurchaseInvoice> {
    const response = await api.post<ApiResponse<PurchaseInvoice>>('/purchase-invoices', data);
    return response.data.data;
  },

  async update(
    id: string,
    data: Partial<CreatePurchaseInvoiceDTO> & { status?: 'PENDING' | 'PAID' }
  ): Promise<PurchaseInvoice> {
    const response = await api.put<ApiResponse<PurchaseInvoice>>(`/purchase-invoices/${id}`, data);
    return response.data.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/purchase-invoices/${id}`);
  },

  async getRetenciones(filters?: PurchaseInvoiceRetentionFilters): Promise<PaginatedResponse<PurchaseInvoiceRetentionRow>> {
    const response = await api.get<PaginatedResponse<PurchaseInvoiceRetentionRow>>('/purchase-invoices/retenciones', { params: filters });
    return response.data;
  },
};

export default purchaseInvoicesService;
