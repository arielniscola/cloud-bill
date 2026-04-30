export type ProductCustomFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT';

export interface ProductCustomField {
  id: string;
  name: string;
  key: string;
  type: ProductCustomFieldType;
  options: string | null;
  isRequired: boolean;
  order: number;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateProductCustomFieldInput = Omit<ProductCustomField, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateProductCustomFieldInput = Partial<Omit<ProductCustomField, 'id' | 'createdAt' | 'updatedAt'>>;

export interface ProductCustomFieldValue {
  id: string;
  productId: string;
  fieldId: string;
  value: string | null;
  createdAt: Date;
  updatedAt: Date;
  field?: ProductCustomField;
}

export interface ProductCustomFieldValueInput {
  fieldId: string;
  value: string | null;
}
