import api from './api';
import type { AfipConfigSummary, AfipConfigDTO } from '../types';
import type { ApiResponse } from '../types';
import type { Invoice } from '../types';

export const afipService = {
  async getConfig(): Promise<AfipConfigSummary | null> {
    const response = await api.get<ApiResponse<AfipConfigSummary | null>>('/afip/config');
    return response.data.data;
  },

  async saveConfig(data: AfipConfigDTO): Promise<AfipConfigSummary> {
    const response = await api.post<ApiResponse<AfipConfigSummary>>('/afip/config', data);
    return response.data.data;
  },

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const response = await api.post<ApiResponse<{ ok: boolean; message: string }>>('/afip/test');
    return response.data.data;
  },

  async emitInvoice(invoiceId: string): Promise<Invoice> {
    const response = await api.post<ApiResponse<Invoice>>(`/invoices/${invoiceId}/emit`);
    return response.data.data;
  },
};

export default afipService;
