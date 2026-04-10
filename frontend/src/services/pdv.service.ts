import api from './api';
import type { PuntoDeVenta, CreatePdvDTO, UpdatePdvDTO } from '../types/pdv.types';

const pdvService = {
  async getAll(): Promise<PuntoDeVenta[]> {
    const res = await api.get<{ data: PuntoDeVenta[] }>('/pdv');
    return res.data.data;
  },

  async getById(id: string): Promise<PuntoDeVenta> {
    const res = await api.get<{ data: PuntoDeVenta }>(`/pdv/${id}`);
    return res.data.data;
  },

  async getMyPdv(): Promise<PuntoDeVenta | null> {
    const res = await api.get<{ data: PuntoDeVenta | null }>('/pdv/my');
    return res.data.data;
  },

  async create(data: CreatePdvDTO): Promise<PuntoDeVenta> {
    const res = await api.post<{ data: PuntoDeVenta }>('/pdv', data);
    return res.data.data;
  },

  async update(id: string, data: UpdatePdvDTO): Promise<PuntoDeVenta> {
    const res = await api.put<{ data: PuntoDeVenta }>(`/pdv/${id}`, data);
    return res.data.data;
  },

  async assignUser(pdvId: string, userId: string): Promise<void> {
    await api.post(`/pdv/${pdvId}/assign`, { userId });
  },

  async unassignUser(pdvId: string, userId: string): Promise<void> {
    await api.post(`/pdv/${pdvId}/unassign`, { userId });
  },
};

export default pdvService;
