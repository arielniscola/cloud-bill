export interface Rubro {
  id: string;
  name: string;
  parentId: string | null;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateRubroInput = Omit<Rubro, 'id' | 'companyId' | 'createdAt' | 'updatedAt'> & { companyId?: string };
export type UpdateRubroInput = Partial<Omit<Rubro, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>;
