import { ProductVariant, CreateProductVariantInput, UpdateProductVariantInput } from '../entities/ProductVariant';

export interface IProductVariantRepository {
  findByProduct(productId: string): Promise<ProductVariant[]>;
  findById(id: string): Promise<ProductVariant | null>;
  findBySku(sku: string, companyId: string): Promise<ProductVariant | null>;
  create(data: CreateProductVariantInput): Promise<ProductVariant>;
  createMany(data: CreateProductVariantInput[]): Promise<ProductVariant[]>;
  update(id: string, data: UpdateProductVariantInput): Promise<ProductVariant>;
  delete(id: string): Promise<void>;
}
