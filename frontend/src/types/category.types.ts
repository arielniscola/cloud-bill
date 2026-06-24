export interface Rubro {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  allowsVariants: boolean;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRubroDTO {
  name: string;
  description?: string | null;
  isActive?: boolean;
  allowsVariants?: boolean;
}

export type UpdateRubroDTO = Partial<CreateRubroDTO>;
