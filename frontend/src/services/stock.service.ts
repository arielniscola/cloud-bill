import api from './api';
import type {
  Stock,
  StockMovement,
  CreateStockMovementDTO,
  StockTransferDTO,
  SetMinQuantityDTO,
  StockMovementFilters,
  BulkAdjustDTO,
  StockLot,
  StockLotFilters,
  StockLotTrace,
  DocumentLot,
  ApiResponse,
  PaginatedResponse,
} from '../types';

export const stockService = {
  /** Lotes de la empresa (por defecto solo los que tienen stock). */
  async getLots(filters: StockLotFilters = {}): Promise<StockLot[]> {
    const { withStock, ...rest } = filters;
    const response = await api.get<ApiResponse<StockLot[]>>('/stock/lots', {
      params: { ...rest, ...(withStock === false ? { withStock: 'false' } : {}) },
    });
    return response.data.data;
  },

  async getLotTrace(lotId: string): Promise<StockLotTrace> {
    const response = await api.get<ApiResponse<StockLotTrace>>(`/stock/lots/${lotId}/trace`);
    return response.data.data;
  },

  /** Lotes que entregaron esos comprobantes (neto), para detalle e impresión. */
  async getLotsByReference(ids: string[]): Promise<DocumentLot[]> {
    if (ids.length === 0) return [];
    const response = await api.get<ApiResponse<DocumentLot[]>>('/stock/lots/by-reference', {
      params: { ids: ids.join(',') },
    });
    return response.data.data;
  },

  async getStock(productId: string, warehouseId: string): Promise<Stock> {
    const response = await api.get<ApiResponse<Stock>>(
      `/stock/${productId}/${warehouseId}`
    );
    return response.data.data;
  },

  async getProductStock(productId: string): Promise<Stock[]> {
    const response = await api.get<ApiResponse<Stock[]>>(
      `/stock/product/${productId}`
    );
    return response.data.data;
  },

  async getWarehouseStock(warehouseId: string): Promise<Stock[]> {
    const response = await api.get<ApiResponse<Stock[]>>(
      `/stock/warehouse/${warehouseId}`
    );
    return response.data.data;
  },

  async getLowStock(): Promise<Stock[]> {
    const response = await api.get<ApiResponse<Stock[]>>('/stock/low-stock');
    return response.data.data;
  },

  async getMovements(
    filters?: StockMovementFilters
  ): Promise<PaginatedResponse<StockMovement>> {
    const response = await api.get<PaginatedResponse<StockMovement>>(
      '/stock/movements',
      { params: filters }
    );
    return response.data;
  },

  async addMovement(data: CreateStockMovementDTO): Promise<StockMovement> {
    const response = await api.post<ApiResponse<StockMovement>>(
      '/stock/movement',
      data
    );
    return response.data.data;
  },

  async transfer(data: StockTransferDTO): Promise<{ from: Stock; to: Stock }> {
    const response = await api.post<ApiResponse<{ from: Stock; to: Stock }>>(
      '/stock/transfer',
      data
    );
    return response.data.data;
  },

  async setMinQuantity(
    productId: string,
    warehouseId: string,
    data: SetMinQuantityDTO
  ): Promise<Stock> {
    const response = await api.put<ApiResponse<Stock>>(
      `/stock/${productId}/${warehouseId}/min-quantity`,
      data
    );
    return response.data.data;
  },

  async adjustBulk(data: BulkAdjustDTO): Promise<void> {
    await api.post('/stock/bulk-adjust', data);
  },

  async exportWarehouseStock(warehouseId: string): Promise<Blob> {
    const response = await api.get(`/stock/warehouse/${warehouseId}/export`, {
      responseType: 'blob',
    });
    return response.data;
  },
};

export default stockService;
