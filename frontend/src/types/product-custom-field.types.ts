export type ProductCustomFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT';

export const PRODUCT_CUSTOM_FIELD_TYPE_LABELS: Record<ProductCustomFieldType, string> = {
  TEXT: 'Texto',
  NUMBER: 'Número',
  DATE: 'Fecha',
  BOOLEAN: 'Sí / No',
  SELECT: 'Lista de opciones',
};

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
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductCustomFieldDTO {
  name: string;
  key: string;
  type: ProductCustomFieldType;
  options?: string | null;
  isRequired?: boolean;
  order?: number;
  isActive?: boolean;
}

export type UpdateProductCustomFieldDTO = Partial<CreateProductCustomFieldDTO>;

export interface ProductCustomFieldValue {
  id: string;
  productId: string;
  fieldId: string;
  value: string | null;
  field?: ProductCustomField;
}

export interface ProductCustomFieldValueDTO {
  fieldId: string;
  value: string | null;
}
