export interface Category {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  allowsVariants: boolean;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryDTO {
  name: string;
  description?: string | null;
  isActive?: boolean;
  allowsVariants?: boolean;
}

export type UpdateCategoryDTO = Partial<CreateCategoryDTO>;
