export interface Rubro {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRubroDTO {
  name: string;
  description?: string | null;
  isActive?: boolean;
}

export type UpdateRubroDTO = Partial<CreateRubroDTO>;
