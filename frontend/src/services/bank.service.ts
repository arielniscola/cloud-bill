import api from './api';
import type { BankAccount, BankMovement, CreateBankAccountDTO, CreateBankMovementDTO } from '../types/bank.types';
import type { ApiResponse, PaginatedResponse } from '../types';

const bankService = {
  async getAll(): Promise<BankAccount[]> {
    const res = await api.get<ApiResponse<BankAccount[]>>('/banks');
    return res.data.data;
  },

  async getById(id: string): Promise<BankAccount> {
    const res = await api.get<ApiResponse<BankAccount>>(`/banks/${id}`);
    return res.data.data;
  },

  async create(data: CreateBankAccountDTO): Promise<BankAccount> {
    const res = await api.post<ApiResponse<BankAccount>>('/banks', data);
    return res.data.data;
  },

  async update(id: string, data: Partial<CreateBankAccountDTO> & { isActive?: boolean }): Promise<BankAccount> {
    const res = await api.put<ApiResponse<BankAccount>>(`/banks/${id}`, data);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/banks/${id}`);
  },

  async getMovements(bankAccountId: string, page = 1, limit = 20): Promise<PaginatedResponse<BankMovement>> {
    const res = await api.get<PaginatedResponse<BankMovement>>(`/banks/${bankAccountId}/movements`, {
      params: { page, limit },
    });
    return res.data;
  },

  async addMovement(bankAccountId: string, data: CreateBankMovementDTO): Promise<BankMovement> {
    const res = await api.post<ApiResponse<BankMovement>>(`/banks/${bankAccountId}/movements`, data);
    return res.data.data;
  },

  async depositCheck(bankAccountId: string, reciboId: string): Promise<void> {
    await api.post(`/banks/${bankAccountId}/deposit-check/${reciboId}`);
  },
};

export default bankService;
