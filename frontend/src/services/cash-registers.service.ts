import api from './api';
import type {
  CashRegister,
  CashRegisterClose,
  CashRegisterClosePreview,
  CashRegisterMovement,
  CashRegisterMovementFilters,
  CreateCashRegisterDTO,
  UpdateCashRegisterDTO,
  CreateCashRegisterCloseDTO,
} from '../types';
import type { ApiResponse, PaginatedResponse } from '../types';

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

  async getMovements(
    id: string,
    filters?: CashRegisterMovementFilters
  ): Promise<PaginatedResponse<CashRegisterMovement>> {
    const response = await api.get<PaginatedResponse<CashRegisterMovement>>(
      `/cash-registers/${id}/movements`,
      { params: filters }
    );
    return response.data;
  },

  async getClosePreview(id: string): Promise<CashRegisterClosePreview> {
    const response = await api.get<ApiResponse<CashRegisterClosePreview>>(
      `/cash-registers/${id}/close-preview`
    );
    return response.data.data;
  },

  async createClose(id: string, data: CreateCashRegisterCloseDTO): Promise<CashRegisterClose> {
    const response = await api.post<ApiResponse<CashRegisterClose>>(
      `/cash-registers/${id}/close`,
      data
    );
    return response.data.data;
  },

  async getCloses(
    id: string,
    params?: { page?: number; limit?: number }
  ): Promise<PaginatedResponse<CashRegisterClose>> {
    const response = await api.get<PaginatedResponse<CashRegisterClose>>(
      `/cash-registers/${id}/closes`,
      { params }
    );
    return response.data;
  },
};

export default cashRegistersService;
