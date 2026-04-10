import api from './api';
import type {
  Remito,
  CreateRemitoDTO,
  DeliverRemitoDTO,
  RemitoFilters,
  ApiResponse,
  PaginatedResponse,
} from '../types';

export const remitosService = {
  async getAll(filters?: RemitoFilters): Promise<PaginatedResponse<Remito>> {
    const response = await api.get<PaginatedResponse<Remito>>('/remitos', {
      params: filters,
    });
    return response.data;
  },

  async getById(id: string): Promise<Remito> {
    const response = await api.get<ApiResponse<Remito>>(`/remitos/${id}`);
    return response.data.data;
  },

  async create(data: CreateRemitoDTO): Promise<Remito> {
    const response = await api.post<ApiResponse<Remito>>('/remitos', data);
    return response.data.data;
  },

  async deliver(id: string, data: DeliverRemitoDTO): Promise<Remito> {
    const response = await api.post<ApiResponse<Remito>>(
      `/remitos/${id}/deliver`,
      data
    );
    return response.data.data;
  },

  async cancel(id: string): Promise<Remito> {
    const response = await api.post<ApiResponse<Remito>>(
      `/remitos/${id}/cancel`
    );
    return response.data.data;
  },

  async sendEmail(id: string, to: string, pdfBlob?: Blob): Promise<void> {
    let pdfBase64: string | undefined;
    if (pdfBlob) {
      const buffer = await pdfBlob.arrayBuffer();
      pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    }
    await api.post(`/remitos/${id}/send-email`, { to, pdfBase64 });
  },
};

export default remitosService;
