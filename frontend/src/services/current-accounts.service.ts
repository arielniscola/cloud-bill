import api from './api';
import type {
  CurrentAccount,
  AccountMovement,
  RegisterPaymentDTO,
  SetCreditLimitDTO,
  AccountMovementFilters,
  CurrentAccountStats,
  CurrentAccountSummary,
  Currency,
  ApiResponse,
  PaginatedResponse,
} from '../types';

export const currentAccountsService = {
  async getByCustomerId(customerId: string): Promise<CurrentAccount[]> {
    const response = await api.get<ApiResponse<CurrentAccount[]>>(
      `/current-accounts/customer/${customerId}`
    );
    return response.data.data;
  },

  async getBalance(customerId: string, currency?: string): Promise<{ balance: number }> {
    const response = await api.get<ApiResponse<{ balance: number }>>(
      `/current-accounts/customer/${customerId}/balance`,
      { params: { currency } }
    );
    return response.data.data;
  },

  async getMovements(
    customerId: string,
    filters?: AccountMovementFilters & { currency?: string }
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

  /**
   * Antigüedad de la deuda por cliente y cobranza del mes, para el listado.
   * La antigüedad es de la moneda pedida (no mezcla ARS con USD).
   */
  async getStats(currency: Currency = 'ARS'): Promise<CurrentAccountStats> {
    const response = await api.get<ApiResponse<CurrentAccountStats>>('/current-accounts/stats', {
      params: { currency },
    });
    return response.data.data;
  },

  /** Antigüedad y comportamiento de pago de un cliente, para el detalle. */
  async getSummary(customerId: string, currency: Currency = 'ARS'): Promise<CurrentAccountSummary> {
    const response = await api.get<ApiResponse<CurrentAccountSummary>>(
      `/current-accounts/customer/${customerId}/summary`,
      { params: { currency } }
    );
    return response.data.data;
  },

  /** `includeCredit`: suma los saldos a favor del cliente (balance < 0). */
  async getAllWithDebt(includeCredit = false): Promise<CurrentAccount[]> {
    const response = await api.get<ApiResponse<CurrentAccount[]>>('/current-accounts', {
      params: { hasDebt: 'true', ...(includeCredit ? { includeCredit: 'true' } : {}) },
    });
    return response.data.data;
  },
};

export default currentAccountsService;
