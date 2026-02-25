export interface CashRegister {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCashRegisterDTO {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateCashRegisterDTO {
  name?: string;
  description?: string;
  isActive?: boolean;
}
