export interface Banco {
  id: string;
  name: string;
  code: string | null;
  sucursal: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBancoInput {
  name: string;
  code?: string | null;
  sucursal?: string | null;
  isActive?: boolean;
  companyId: string;
}

export interface UpdateBancoInput {
  name?: string;
  code?: string | null;
  sucursal?: string | null;
  isActive?: boolean;
}
