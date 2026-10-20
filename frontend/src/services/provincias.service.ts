import api from './api';
import type { Provincia, CreateProvinciaDTO, UpdateProvinciaDTO } from '../types/provincia.types';

const provinciasService = {
  async getAll(): Promise<Provincia[]> {
    const res = await api.get<{ status: string; data: Provincia[] }>('/provincias');
    return res.data.data;
  },

  async create(data: CreateProvinciaDTO): Promise<Provincia> {
    const res = await api.post<{ status: string; data: Provincia }>('/provincias', data);
    return res.data.data;
  },

  async update(id: string, data: UpdateProvinciaDTO): Promise<Provincia> {
    const res = await api.put<{ status: string; data: Provincia }>(`/provincias/${id}`, data);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/provincias/${id}`);
  },
};

export default provinciasService;
