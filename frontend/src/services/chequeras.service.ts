import api from './api';
import type { Chequera, CreateChequeraDTO, UpdateChequeraDTO } from '../types/chequera.types';

const chequerasService = {
  async getAll(): Promise<Chequera[]> {
    const res = await api.get<{ status: string; data: Chequera[] }>('/chequeras');
    return res.data.data;
  },

  async create(data: CreateChequeraDTO): Promise<Chequera> {
    const res = await api.post<{ status: string; data: Chequera }>('/chequeras', data);
    return res.data.data;
  },

  async update(id: string, data: UpdateChequeraDTO): Promise<Chequera> {
    const res = await api.put<{ status: string; data: Chequera }>(`/chequeras/${id}`, data);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/chequeras/${id}`);
  },
};

export default chequerasService;
