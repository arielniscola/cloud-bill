import { blobToBase64 } from '../utils/blob';
import api from './api';
import type {
  Invoice,
  CreateInvoiceDTO,
  UpdateInvoiceStatusDTO,
  PayInvoiceDTO,
  InvoiceFilters,
  InvoiceStats,
  ArcaBatchResult,
  ApiResponse,
  PaginatedResponse,
  AfipError,
} from '../types';

export const invoicesService = {
  async getAll(filters?: InvoiceFilters): Promise<PaginatedResponse<Invoice>> {
    const response = await api.get<PaginatedResponse<Invoice>>('/invoices', {
      params: filters,
    });
    return response.data;
  },

  /**
   * Totales del conjunto filtrado completo. Va aparte del listado: sumar la
   * página y rotularla "Total" era el número que engañaba.
   */
  async getStats(filters?: InvoiceFilters): Promise<InvoiceStats> {
    // La paginación no aplica: los totales son del conjunto entero.
    const params: InvoiceFilters = { ...filters };
    delete params.page;
    delete params.limit;
    const response = await api.get<ApiResponse<InvoiceStats>>('/invoices/stats', { params });
    return response.data.data;
  },

  /**
   * Emite ante ARCA varias facturas pendientes, una por vez y en orden de
   * fecha. `redateToToday` pasa a hoy las de días anteriores (ARCA no acepta
   * fechas de más de 5 días atrás ni anteriores al último autorizado).
   */
  async emitBatch(ids: string[], redateToToday: boolean): Promise<ArcaBatchResult[]> {
    const response = await api.post<ApiResponse<ArcaBatchResult[]>>('/invoices/emit-batch', { ids, redateToToday });
    return response.data.data;
  },

  /** Cantidad de facturas formales sin CAE que se pueden emitir ante ARCA. */
  async countPendingArca(): Promise<number> {
    const response = await api.get<PaginatedResponse<Invoice>>('/invoices', {
      params: { pendingArca: true, limit: 1 },
    });
    return response.data.total;
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

  // Elimina una factura en borrador (solo permitido en estado DRAFT).
  async delete(id: string): Promise<void> {
    await api.delete(`/invoices/${id}`);
  },

  async sendEmail(id: string, to: string, pdfBlob?: Blob): Promise<void> {
    let pdfBase64: string | undefined;
    if (pdfBlob) {
      pdfBase64 = await blobToBase64(pdfBlob);
    }
    await api.post(`/invoices/${id}/send-email`, { to, pdfBase64 });
  },

  async getAfipErrors(id: string): Promise<AfipError[]> {
    const response = await api.get<ApiResponse<AfipError[]>>(`/invoices/${id}/afip-errors`);
    return response.data.data;
  },
};

export default invoicesService;
