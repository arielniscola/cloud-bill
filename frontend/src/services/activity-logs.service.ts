import api from './api';
import type { ActivityLog, ActivityLogFilters, PaginatedResponse } from '../types';

export const activityLogsService = {
  async getAll(filters?: ActivityLogFilters): Promise<PaginatedResponse<ActivityLog>> {
    const response = await api.get<PaginatedResponse<ActivityLog>>('/activity-logs', {
      params: filters,
    });
    return response.data;
  },

  /** Registros de un documento (más viejo primero), para su línea de tiempo. Disponible para todos los roles. */
  async getForDocument(entityId: string): Promise<ActivityLog[]> {
    const response = await api.get<{ status: string; data: ActivityLog[] }>(`/activity-logs/document/${entityId}`);
    return response.data.data;
  },

  async getEntities(): Promise<string[]> {
    const response = await api.get<{ status: string; data: string[] }>('/activity-logs/entities');
    return response.data.data;
  },
};

export default activityLogsService;
