import {
  ProductCustomField,
  CreateProductCustomFieldInput,
  UpdateProductCustomFieldInput,
} from '../entities/ProductCustomField';

export interface IProductCustomFieldRepository {
  findAll(companyId?: string, onlyActive?: boolean): Promise<ProductCustomField[]>;
  findById(id: string, companyId?: string): Promise<ProductCustomField | null>;
  findByKey(companyId: string, key: string): Promise<ProductCustomField | null>;
  create(data: CreateProductCustomFieldInput): Promise<ProductCustomField>;
  update(id: string, data: UpdateProductCustomFieldInput): Promise<ProductCustomField>;
  delete(id: string): Promise<void>;
}
