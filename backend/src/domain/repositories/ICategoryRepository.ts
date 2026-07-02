import { Category, CreateCategoryInput, UpdateCategoryInput } from '../entities/Category';

export interface ICategoryRepository {
  findAll(companyId?: string): Promise<Category[]>;
  findById(id: string, companyId?: string): Promise<Category | null>;
  create(data: CreateCategoryInput): Promise<Category>;
  update(id: string, data: UpdateCategoryInput): Promise<Category>;
  delete(id: string): Promise<void>;
}
