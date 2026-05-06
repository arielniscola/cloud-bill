import api from './api';
import type {
  ProductVariant,
  CreateProductVariantDTO,
  UpdateProductVariantDTO,
  BulkCreateProductVariantDTO,
} from '../types/product-variant.types';

const productVariantsService = {
  async getByProduct(productId: string): Promise<ProductVariant[]> {
    const res = await api.get<{ status: string; data: ProductVariant[] }>(
      `/products/${productId}/variants`
    );
    return res.data.data;
  },

  async getById(id: string): Promise<ProductVariant> {
    const res = await api.get<{ status: string; data: ProductVariant }>(
      `/product-variants/${id}`
    );
    return res.data.data;
  },

  async create(productId: string, data: CreateProductVariantDTO): Promise<ProductVariant> {
    const res = await api.post<{ status: string; data: ProductVariant }>(
      `/products/${productId}/variants`,
      data
    );
    return res.data.data;
  },

  async bulkCreate(productId: string, data: BulkCreateProductVariantDTO): Promise<ProductVariant[]> {
    const res = await api.post<{ status: string; data: ProductVariant[] }>(
      `/products/${productId}/variants/bulk`,
      data
    );
    return res.data.data;
  },

  async update(id: string, data: UpdateProductVariantDTO): Promise<ProductVariant> {
    const res = await api.put<{ status: string; data: ProductVariant }>(
      `/product-variants/${id}`,
      data
    );
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/product-variants/${id}`);
  },
};

export default productVariantsService;
