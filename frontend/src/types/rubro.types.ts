export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  parent?: Category;
  children?: Category[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryDTO {
  name: string;
  parentId?: string | null;
}

export interface UpdateCategoryDTO extends Partial<CreateCategoryDTO> {}
