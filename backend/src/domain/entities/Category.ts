export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateCategoryInput = Omit<Category, 'id' | 'companyId' | 'createdAt' | 'updatedAt'> & { companyId?: string };
export type UpdateCategoryInput = Partial<Omit<Category, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>;
