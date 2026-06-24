export interface Category {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  allowsVariants: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateCategoryInput = Omit<Category, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateCategoryInput = Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>>;
