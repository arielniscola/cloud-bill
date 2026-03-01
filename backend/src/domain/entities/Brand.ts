export interface Brand {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateBrandInput = Omit<Brand, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateBrandInput = Partial<Omit<Brand, 'id' | 'createdAt' | 'updatedAt'>>;
