export interface Chequera {
  id: string;
  name: string | null;
  bank: string;
  accountNumber: string;
  numberFrom: number | null;
  numberTo: number | null;
  nextNumber: number | null;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateChequeraInput {
  name?: string | null;
  bank: string;
  accountNumber: string;
  numberFrom?: number | null;
  numberTo?: number | null;
  nextNumber?: number | null;
  isActive?: boolean;
  companyId: string;
}

export interface UpdateChequeraInput {
  name?: string | null;
  bank?: string;
  accountNumber?: string;
  numberFrom?: number | null;
  numberTo?: number | null;
  nextNumber?: number | null;
  isActive?: boolean;
}
