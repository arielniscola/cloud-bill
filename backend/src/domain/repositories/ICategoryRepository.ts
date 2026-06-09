import { Category, CreateCategoryInput, UpdateCategoryInput } from '../entities/Category';

export interface ICategoryRepository {
  findById(id: string): Promise<Category | null>;
  findAll(companyId?: string): Promise<Category[]>;
  findByParentId(parentId: string | null): Promise<Category[]>;
  create(data: CreateCategoryInput & { companyId?: string }): Promise<Category>;
  update(id: string, data: UpdateCategoryInput): Promise<Category>;
  delete(id: string): Promise<void>;
}
