import api from './api';
import type {
  Stock,
  StockMovement,
  CreateStockMovementDTO,
  StockTransferDTO,
  SetMinQuantityDTO,
  StockMovementFilters,
  ApiResponse,
  PaginatedResponse,
} from '../types';

export const stockService = {
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
};

export default stockService;
