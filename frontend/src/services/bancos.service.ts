import api from './api';
import type { Banco, CreateBancoDTO, UpdateBancoDTO } from '../types/banco.types';

const bancosService = {
  async getAll(): Promise<Banco[]> {
    const res = await api.get<{ status: string; data: Banco[] }>('/bancos');
    return res.data.data;
  },

  async getById(id: string): Promise<Banco> {
    const res = await api.get<{ status: string; data: Banco }>(`/bancos/${id}`);
    return res.data.data;
  },

  async create(data: CreateBancoDTO): Promise<Banco> {
    const res = await api.post<{ status: string; data: Banco }>('/bancos', data);
    return res.data.data;
  },

  async update(id: string, data: UpdateBancoDTO): Promise<Banco> {
    const res = await api.put<{ status: string; data: Banco }>(`/bancos/${id}`, data);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/bancos/${id}`);
  },
};

export default bancosService;
