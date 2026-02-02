import api from './api';
import type { LoginRequest, LoginResponse, ApiResponse } from '../types';

export const authService = {
  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/login', data);
    return response.data.data;
  },
};

export default authService;
