import api from './api';
import type {
  Purchase, CreatePurchaseDTO, PurchaseFilters,
  PurchaseInvoice, CreatePurchaseInvoiceDTO,
  ApiResponse, PaginatedResponse,
} from '../types';
import type { PendingPurchaseInvoice } from '../types/ordenPago.types';

export const purchasesService = {
  async getAll(filters?: PurchaseFilters): Promise<PaginatedResponse<Purchase>> {
    const response = await api.get<PaginatedResponse<Purchase>>('/purchases', { params: filters });
    return response.data;
  },

  async getById(id: string): Promise<Purchase> {
    const response = await api.get<ApiResponse<Purchase>>(`/purchases/${id}`);
    return response.data.data;
  },

  async create(data: CreatePurchaseDTO): Promise<Purchase> {
    const response = await api.post<ApiResponse<Purchase>>('/purchases', data);
    return response.data.data;
  },

  async cancel(id: string): Promise<Purchase> {
    const response = await api.post<ApiResponse<Purchase>>(`/purchases/${id}/cancel`);
    return response.data.data;
  },

  async getPendingInvoices(supplierId: string): Promise<PendingPurchaseInvoice[]> {
    const response = await api.get<ApiResponse<PendingPurchaseInvoice[]>>('/purchases/pending-invoices', { params: { supplierId } });
    return response.data.data;
  },

  async assignWarehouse(id: string, warehouseId: string): Promise<Purchase> {
    const response = await api.patch<ApiResponse<Purchase>>(`/purchases/${id}/warehouse`, { warehouseId });
    return response.data.data;
  },

  // ── Supplier invoices ──────────────────────────────────────────
  async getInvoices(purchaseId: string): Promise<PurchaseInvoice[]> {
    const response = await api.get<ApiResponse<PurchaseInvoice[]>>(`/purchases/${purchaseId}/invoices`);
    return response.data.data;
  },

  async addInvoice(purchaseId: string, data: CreatePurchaseInvoiceDTO): Promise<PurchaseInvoice> {
    const response = await api.post<ApiResponse<PurchaseInvoice>>(`/purchases/${purchaseId}/invoices`, data);
    return response.data.data;
  },

  async updateInvoice(
    purchaseId: string,
    invoiceId: string,
    data: Partial<CreatePurchaseInvoiceDTO> & { status?: 'PENDING' | 'PAID' }
  ): Promise<PurchaseInvoice> {
    const response = await api.put<ApiResponse<PurchaseInvoice>>(
      `/purchases/${purchaseId}/invoices/${invoiceId}`,
      data
    );
    return response.data.data;
  },

  async deleteInvoice(purchaseId: string, invoiceId: string): Promise<void> {
    await api.delete(`/purchases/${purchaseId}/invoices/${invoiceId}`);
  },
};

export default purchasesService;
