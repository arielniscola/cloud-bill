import api from './api';
import type { CashRegister, CreateCashRegisterDTO, UpdateCashRegisterDTO } from '../types';
import type { ApiResponse } from '../types';

export const cashRegistersService = {
  async getAll(onlyActive = false): Promise<CashRegister[]> {
    const response = await api.get<ApiResponse<CashRegister[]>>('/cash-registers', {
      params: onlyActive ? { active: true } : undefined,
    });
    return response.data.data;
  },

  async getById(id: string): Promise<CashRegister> {
    const response = await api.get<ApiResponse<CashRegister>>(`/cash-registers/${id}`);
    return response.data.data;
  },

  async create(data: CreateCashRegisterDTO): Promise<CashRegister> {
    const response = await api.post<ApiResponse<CashRegister>>('/cash-registers', data);
    return response.data.data;
  },

  async update(id: string, data: UpdateCashRegisterDTO): Promise<CashRegister> {
    const response = await api.put<ApiResponse<CashRegister>>(`/cash-registers/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/cash-registers/${id}`);
  },
};

export default cashRegistersService;
