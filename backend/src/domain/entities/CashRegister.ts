export interface CashRegister {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCashRegisterInput {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateCashRegisterInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}
