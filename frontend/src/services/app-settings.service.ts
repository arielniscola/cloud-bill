import api from './api';
import type { AppSettings, UpdateAppSettingsDTO, ApiResponse } from '../types';

export const appSettingsService = {
  async get(): Promise<AppSettings> {
    const response = await api.get<ApiResponse<AppSettings>>('/app-settings');
    return response.data.data;
  },

  async update(data: UpdateAppSettingsDTO): Promise<AppSettings> {
    const response = await api.put<ApiResponse<AppSettings>>('/app-settings', data);
    return response.data.data;
  },
};

export default appSettingsService;
