import api from './api';
import type { Rubro, CreateRubroDTO, UpdateRubroDTO } from '../types/rubro.types';

const rubrosService = {
  async getAll(): Promise<Rubro[]> {
    const res = await api.get<{ status: string; data: Rubro[] }>('/rubros');
    return res.data.data;
  },

  async getById(id: string): Promise<Rubro> {
    const res = await api.get<{ status: string; data: Rubro }>(`/rubros/${id}`);
    return res.data.data;
  },

  async create(data: CreateRubroDTO): Promise<Rubro> {
    const res = await api.post<{ status: string; data: Rubro }>('/rubros', data);
    return res.data.data;
  },

  async update(id: string, data: UpdateRubroDTO): Promise<Rubro> {
    const res = await api.put<{ status: string; data: Rubro }>(`/rubros/${id}`, data);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/rubros/${id}`);
  },
};

export default rubrosService;
