import api from './api';
import type {
  ProductCustomField,
  CreateProductCustomFieldDTO,
  UpdateProductCustomFieldDTO,
} from '../types/product-custom-field.types';

const productCustomFieldsService = {
  async getAll(activeOnly = false): Promise<ProductCustomField[]> {
    const res = await api.get<{ status: string; data: ProductCustomField[] }>(
      '/product-custom-fields',
      { params: activeOnly ? { activeOnly: 'true' } : undefined },
    );
    return res.data.data;
  },

  async getById(id: string): Promise<ProductCustomField> {
    const res = await api.get<{ status: string; data: ProductCustomField }>(`/product-custom-fields/${id}`);
    return res.data.data;
  },

  async create(data: CreateProductCustomFieldDTO): Promise<ProductCustomField> {
    const res = await api.post<{ status: string; data: ProductCustomField }>('/product-custom-fields', data);
    return res.data.data;
  },

  async update(id: string, data: UpdateProductCustomFieldDTO): Promise<ProductCustomField> {
    const res = await api.put<{ status: string; data: ProductCustomField }>(`/product-custom-fields/${id}`, data);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/product-custom-fields/${id}`);
  },
};

export default productCustomFieldsService;
