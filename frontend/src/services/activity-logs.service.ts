import api from './api';
import type { ActivityLog, ActivityLogFilters, PaginatedResponse } from '../types';

export const activityLogsService = {
  async getAll(filters?: ActivityLogFilters): Promise<PaginatedResponse<ActivityLog>> {
    const response = await api.get<PaginatedResponse<ActivityLog>>('/activity-logs', {
      params: filters,
    });
    return response.data;
  },
};

export default activityLogsService;
