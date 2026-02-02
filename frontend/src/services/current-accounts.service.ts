import api from './api';
import type {
  CurrentAccount,
  AccountMovement,
  RegisterPaymentDTO,
  SetCreditLimitDTO,
  AccountMovementFilters,
  ApiResponse,
  PaginatedResponse,
} from '../types';

export const currentAccountsService = {
  async getByCustomerId(customerId: string): Promise<CurrentAccount> {
    const response = await api.get<ApiResponse<CurrentAccount>>(
      `/current-accounts/customer/${customerId}`
    );
    return response.data.data;
  },

  async getBalance(customerId: string): Promise<{ balance: number }> {
    const response = await api.get<ApiResponse<{ balance: number }>>(
      `/current-accounts/customer/${customerId}/balance`
    );
    return response.data.data;
  },

  async getMovements(
    customerId: string,
    filters?: AccountMovementFilters
  ): Promise<PaginatedResponse<AccountMovement>> {
    const response = await api.get<PaginatedResponse<AccountMovement>>(
      `/current-accounts/customer/${customerId}/movements`,
      { params: filters }
    );
    return response.data;
  },

  async registerPayment(
    customerId: string,
    data: RegisterPaymentDTO
  ): Promise<AccountMovement> {
    const response = await api.post<ApiResponse<AccountMovement>>(
      `/current-accounts/customer/${customerId}/payment`,
      data
    );
    return response.data.data;
  },

  async setCreditLimit(
    customerId: string,
    data: SetCreditLimitDTO
  ): Promise<CurrentAccount> {
    const response = await api.put<ApiResponse<CurrentAccount>>(
      `/current-accounts/customer/${customerId}/credit-limit`,
      data
    );
    return response.data.data;
  },
};

export default currentAccountsService;
