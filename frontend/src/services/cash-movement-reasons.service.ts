import api from './api';
import type { CashMovementReason, CashMovementReasonType } from '../types';

const cashMovementReasonsService = {
  /** `all` incluye los desactivados (pantalla de configuración). */
  async getAll(all = false): Promise<CashMovementReason[]> {
    const res = await api.get<{ status: string; data: CashMovementReason[] }>('/cash-movement-reasons', { params: all ? { all: true } : undefined });
    return res.data.data;
  },

  async create(data: { name: string; type: CashMovementReasonType }): Promise<CashMovementReason> {
    const res = await api.post<{ status: string; data: CashMovementReason }>('/cash-movement-reasons', data);
    return res.data.data;
  },

  async update(id: string, data: Partial<{ name: string; type: CashMovementReasonType; isActive: boolean }>): Promise<CashMovementReason> {
    const res = await api.put<{ status: string; data: CashMovementReason }>(`/cash-movement-reasons/${id}`, data);
    return res.data.data;
  },

  /** Si el motivo ya se usó, el backend lo desactiva en vez de borrarlo. */
  async delete(id: string): Promise<{ deleted: boolean; deactivated: boolean }> {
    const res = await api.delete<{ status: string; data: { deleted: boolean; deactivated: boolean } }>(`/cash-movement-reasons/${id}`);
    return res.data.data;
  },
};

export default cashMovementReasonsService;
