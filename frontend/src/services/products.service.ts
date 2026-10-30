import api from './api';
import type {
  Product,
  CreateProductDTO,
  UpdateProductDTO,
  ProductFilters,
  ApiResponse,
  PaginatedResponse,
  PriceHistoryEntry,
  PriceOperation,
  PriceOperationItem,
  ProductOverview,
} from '../types';
import { resizeImage } from '../utils/imageResize';

/** Respuesta de POST /products/:id/image/upload-url */
interface PresignedUpload {
  uploadUrl: string;
  headers: Record<string, string>;
  key: string;
  publicUrl: string;
  expiresIn: number;
}

export const productsService = {
  async getAll(filters?: ProductFilters): Promise<PaginatedResponse<Product>> {
    const response = await api.get<PaginatedResponse<Product>>('/products', {
      params: filters,
    });
    return response.data;
  },

  async getById(id: string): Promise<Product> {
    const response = await api.get<ApiResponse<Product>>(`/products/${id}`);
    return response.data.data;
  },

  async create(data: CreateProductDTO): Promise<Product> {
    const response = await api.post<ApiResponse<Product>>('/products', data);
    return response.data.data;
  },

  async update(id: string, data: UpdateProductDTO): Promise<Product> {
    const response = await api.put<ApiResponse<Product>>(`/products/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/products/${id}`);
  },

  async bulkUpdatePrices(updates: Array<{ id: string; price?: number; cost?: number; costUSD?: number | null; salePriceUSD?: number | null }>): Promise<{ updated: number }> {
    const response = await api.patch<{ status: string; updated: number }>('/products/bulk-price-update', { updates });
    return response.data;
  },

  /** Cuántos productos tienen costo en USD y con qué cotización se calculó su costo en pesos. */
  async getUsdCostSummary(): Promise<{ count: number; minRate: number | null; maxRate: number | null }> {
    const response = await api.get<ApiResponse<{ count: number; minRate: number | null; maxRate: number | null }>>('/products/usd-costs/summary');
    return response.data.data;
  },

  /** Recalcula el costo en pesos de todos los productos con costo en USD (sin `rate` usa la cotización del día). */
  async getOverview(id: string): Promise<ProductOverview> {
    const response = await api.get<ApiResponse<ProductOverview>>(`/products/${id}/overview`);
    return response.data.data;
  },

  async getPriceHistory(id: string): Promise<PriceHistoryEntry[]> {
    const response = await api.get<ApiResponse<PriceHistoryEntry[]>>(`/products/${id}/price-history`);
    return response.data.data;
  },

  async getPriceOperations(page = 1, limit = 20): Promise<PaginatedResponse<PriceOperation>> {
    const response = await api.get<PaginatedResponse<PriceOperation>>('/products/price-history/operations', { params: { page, limit } });
    return response.data;
  },

  async getPriceOperation(ref: string): Promise<PriceOperationItem[]> {
    const response = await api.get<ApiResponse<PriceOperationItem[]>>(`/products/price-history/operations/${encodeURIComponent(ref)}`);
    return response.data.data;
  },

  async revertPriceOperation(ref: string): Promise<{ reverted: number; changedSince: number; created: number }> {
    const response = await api.post<ApiResponse<{ reverted: number; changedSince: number; created: number }>>(
      `/products/price-history/operations/${encodeURIComponent(ref)}/revert`,
    );
    return response.data.data;
  },

  async recalculateUsdCosts(params: { rate?: number; keepMargin?: boolean }): Promise<{ updated: number; rate: number }> {
    const response = await api.post<ApiResponse<{ updated: number; rate: number }>>('/products/recalculate-usd-costs', params);
    return response.data.data;
  },

  async bulkUpdate(
    ids: string[],
    data: { brandId?: string | null; taxRate?: number; rubroId?: string | null; supplierId?: string | null; isActive?: boolean }
  ): Promise<{ updated: number }> {
    const response = await api.patch<{ status: string; updated: number }>('/products/bulk-update', { ids, data });
    return response.data;
  },

  // Aplica el cambio a TODOS los productos que matchean el filtro (sin
  // cargarlos al navegador) — escala sin importar cuántos sean.
  async bulkUpdateByFilter(
    filters: ProductFilters,
    data: { brandId?: string | null; taxRate?: number; rubroId?: string | null; supplierId?: string | null; isActive?: boolean }
  ): Promise<{ updated: number }> {
    const response = await api.patch<{ status: string; updated: number }>('/products/bulk-update-by-filter', { filters, data });
    return response.data;
  },

  /**
   * Sube la imagen del producto en tres pasos: se achica en el navegador, se
   * pide una URL firmada y se hace el PUT directo al storage. El archivo nunca
   * pasa por nuestro backend (en Vercel el body de una function está limitado
   * a 4.5 MB, menos que una foto de celular).
   */
  async uploadImage(productId: string, file: File): Promise<Product> {
    const { blob, contentType } = await resizeImage(file);

    const presign = await api.post<ApiResponse<PresignedUpload>>(
      `/products/${productId}/image/upload-url`,
      { contentType, size: blob.size }
    );
    const upload = presign.data.data;

    // fetch y no `api`: la URL apunta al storage, y mandarle nuestro header
    // Authorization invalidaría la firma en varios proveedores.
    const put = await fetch(upload.uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: { ...upload.headers, 'Content-Type': contentType },
    });
    if (!put.ok) {
      throw new Error(`No se pudo subir la imagen al almacenamiento (${put.status})`);
    }

    // Recién con el PUT confirmado se guarda la URL en el producto.
    const confirmed = await api.put<ApiResponse<Product>>(`/products/${productId}/image`, {
      key: upload.key,
    });
    return confirmed.data.data;
  },

  async deleteImage(productId: string): Promise<Product> {
    const response = await api.delete<ApiResponse<Product>>(`/products/${productId}/image`);
    return response.data.data;
  },
};

export default productsService;
