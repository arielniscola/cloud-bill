export interface Rubro {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateRubroInput = Omit<Rubro, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateRubroInput = Partial<Omit<Rubro, 'id' | 'createdAt' | 'updatedAt'>>;
