import api from './api';
import type { AfipConfigSummary, AfipConfigDTO } from '../types';
import type { ApiResponse } from '../types';
import type { Invoice } from '../types';

export interface PadronData {
  cuit: string;
  name: string;
  taxCondition: 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTISTA' | 'EXENTO' | 'CONSUMIDOR_FINAL';
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  personType: string | null;
  estado: string | null;
}

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

  async emitInvoice(invoiceId: string): Promise<{ invoice: Invoice; warnings: string | null }> {
    const response = await api.post<ApiResponse<Invoice> & { warnings?: string }>(`/invoices/${invoiceId}/emit`);
    return { invoice: response.data.data, warnings: response.data.warnings ?? null };
  },

  /** Consulta la constancia de inscripción de ARCA por CUIT (autocompletar altas). */
  async getPadron(cuit: string): Promise<PadronData> {
    const digits = cuit.replace(/\D/g, '');
    const response = await api.get<ApiResponse<PadronData>>(`/afip/padron/${digits}`);
    return response.data.data;
  },
};

export default afipService;
