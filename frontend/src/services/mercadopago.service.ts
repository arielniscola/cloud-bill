import api from './api';
import type { ApiResponse } from '../types';
import type {
  MpStatus,
  MpPreferenceResult,
  MpBalance,
  MpMovementsResult,
  CreateMpPreferenceDTO,
  LinkMpPaymentDTO,
} from '../types/mercadopago.types';

const mercadoPagoService = {
  async getStatus(): Promise<MpStatus> {
    const res = await api.get<ApiResponse<MpStatus>>('/mercadopago/status');
    return res.data.data;
  },

  async createPreference(data: CreateMpPreferenceDTO): Promise<MpPreferenceResult> {
    const res = await api.post<ApiResponse<MpPreferenceResult>>('/mercadopago/preference', data);
    return res.data.data;
  },

  async getBalance(): Promise<MpBalance> {
    const res = await api.get<ApiResponse<MpBalance>>('/mercadopago/balance');
    return res.data.data;
  },

  async getMovements(params: {
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<MpMovementsResult> {
    const res = await api.get<ApiResponse<MpMovementsResult>>('/mercadopago/movements', { params });
    return res.data.data;
  },

  async linkPayment(data: LinkMpPaymentDTO): Promise<unknown> {
    const res = await api.post<ApiResponse<unknown>>('/mercadopago/link-payment', data);
    return res.data.data;
  },
};

export default mercadoPagoService;
