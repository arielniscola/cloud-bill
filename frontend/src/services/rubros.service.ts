import api from './api';
import type {
  Rubro,
  CreateRubroDTO,
  UpdateRubroDTO,
  ApiResponse,
} from '../types';

export const rubrosService = {
  async getAll(): Promise<Rubro[]> {
    const response = await api.get<ApiResponse<Rubro[]>>('/rubros');
    return response.data.data;
  },

  async getById(id: string): Promise<Rubro> {
    const response = await api.get<ApiResponse<Rubro>>(`/rubros/${id}`);
    return response.data.data;
  },

  async create(data: CreateRubroDTO): Promise<Rubro> {
    const response = await api.post<ApiResponse<Rubro>>('/rubros', data);
    return response.data.data;
  },

  async update(id: string, data: UpdateRubroDTO): Promise<Rubro> {
    const response = await api.put<ApiResponse<Rubro>>(`/rubros/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/rubros/${id}`);
  },
};

export default rubrosService;
