export interface Banco {
  id: string;
  name: string;
  code: string | null;
  sucursal: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBancoDTO {
  name: string;
  code?: string | null;
  sucursal?: string | null;
  isActive?: boolean;
}

export type UpdateBancoDTO = Partial<CreateBancoDTO>;
