import { Category, CreateCategoryInput, UpdateCategoryInput } from '../entities/Category';

export interface ICategoryRepository {
  findById(id: string): Promise<Category | null>;
  findAll(): Promise<Category[]>;
  findByParentId(parentId: string | null): Promise<Category[]>;
  create(data: CreateCategoryInput): Promise<Category>;
  update(id: string, data: UpdateCategoryInput): Promise<Category>;
  delete(id: string): Promise<void>;
}
