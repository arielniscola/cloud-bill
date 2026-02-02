import api from './api';
import type {
  Warehouse,
  CreateWarehouseDTO,
  UpdateWarehouseDTO,
  ApiResponse,
} from '../types';

export const warehousesService = {
  async getAll(): Promise<Warehouse[]> {
    const response = await api.get<ApiResponse<Warehouse[]>>('/warehouses');
    return response.data.data;
  },

  async getById(id: string): Promise<Warehouse> {
    const response = await api.get<ApiResponse<Warehouse>>(`/warehouses/${id}`);
    return response.data.data;
  },

  async create(data: CreateWarehouseDTO): Promise<Warehouse> {
    const response = await api.post<ApiResponse<Warehouse>>('/warehouses', data);
    return response.data.data;
  },

  async update(id: string, data: UpdateWarehouseDTO): Promise<Warehouse> {
    const response = await api.put<ApiResponse<Warehouse>>(`/warehouses/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/warehouses/${id}`);
  },
};

export default warehousesService;
