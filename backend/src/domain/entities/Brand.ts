export interface Brand {
  id: string;
  name: string;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateBrandInput = Omit<Brand, 'id' | 'companyId' | 'createdAt' | 'updatedAt'> & { companyId?: string };
export type UpdateBrandInput = Partial<Omit<Brand, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>;
