import api from './api';
import type { ApiResponse } from '../types';
import type { ApprovalAction, ApprovalEntityType } from '../utils/approvalActions';

export type ApprovalStatus = 'PENDING' | 'EXECUTING' | 'APPROVED' | 'REJECTED' | 'FAILED';

export interface ApprovalRequest {
  id: string;
  action: ApprovalAction;
  actionLabel: string;
  entityType: ApprovalEntityType;
  entityId: string;
  entityLabel: string | null;
  reason: string | null;
  status: ApprovalStatus;
  autoApproved: boolean;
  requestedById: string | null;
  requestedByName: string | null;
  resolvedById: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionComment: string | null;
  errorMessage: string | null;
  createdAt: string;
  /** Solo en movimientos de caja: para el link al detalle de la caja. */
  cashRegisterId: string | null;
}

export interface ApprovalActionSetting {
  key: ApprovalAction;
  label: string;
  enabled: boolean;
}

export const approvalsService = {
  async getAll(status: ApprovalStatus | 'ALL' = 'PENDING'): Promise<ApprovalRequest[]> {
    const response = await api.get<ApiResponse<ApprovalRequest[]>>('/approvals', { params: { status } });
    return response.data.data!;
  },

  async pendingCount(): Promise<number> {
    const response = await api.get<ApiResponse<{ count: number }>>('/approvals/pending-count');
    return response.data.data!.count;
  },

  async getOpenForEntity(entityType: ApprovalEntityType, entityId: string): Promise<ApprovalRequest | null> {
    const response = await api.get<ApiResponse<ApprovalRequest | null>>(`/approvals/entity/${entityType}/${entityId}`);
    return response.data.data ?? null;
  },

  /** Solicitudes abiertas de varios documentos del mismo tipo (para marcar filas de un listado). */
  async getOpenForEntities(entityType: ApprovalEntityType, entityIds: string[]): Promise<ApprovalRequest[]> {
    if (!entityIds.length) return [];
    const response = await api.get<ApiResponse<ApprovalRequest[]>>('/approvals/open', {
      params: { entityType, ids: entityIds.join(',') },
    });
    return response.data.data ?? [];
  },

  async approve(id: string, comment?: string): Promise<ApprovalRequest> {
    const response = await api.post<ApiResponse<ApprovalRequest>>(`/approvals/${id}/approve`, { comment });
    return response.data.data!;
  },

  async reject(id: string, comment?: string): Promise<ApprovalRequest> {
    const response = await api.post<ApiResponse<ApprovalRequest>>(`/approvals/${id}/reject`, { comment });
    return response.data.data!;
  },

  async getSettings(): Promise<ApprovalActionSetting[]> {
    const response = await api.get<ApiResponse<ApprovalActionSetting[]>>('/approvals/settings');
    return response.data.data!;
  },

  async updateSettings(disabledActions: ApprovalAction[]): Promise<ApprovalActionSetting[]> {
    const response = await api.put<ApiResponse<ApprovalActionSetting[]>>('/approvals/settings', { disabledActions });
    return response.data.data!;
  },
};

export default approvalsService;
