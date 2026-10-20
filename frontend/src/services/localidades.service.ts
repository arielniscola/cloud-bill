import api from './api';
import type { Localidad, CreateLocalidadDTO, UpdateLocalidadDTO } from '../types/localidad.types';

const localidadesService = {
  async getAll(): Promise<Localidad[]> {
    const res = await api.get<{ status: string; data: Localidad[] }>('/localidades');
    return res.data.data;
  },

  async create(data: CreateLocalidadDTO): Promise<Localidad> {
    const res = await api.post<{ status: string; data: Localidad }>('/localidades', data);
    return res.data.data;
  },

  async update(id: string, data: UpdateLocalidadDTO): Promise<Localidad> {
    const res = await api.put<{ status: string; data: Localidad }>(`/localidades/${id}`, data);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/localidades/${id}`);
  },

  /** Crea en el catálogo las localidades ya cargadas en clientes y proveedores. */
  async importFromParties(): Promise<{ created: number }> {
    const res = await api.post<{ status: string; data: { created: number } }>('/localidades/import');
    return res.data.data;
  },
};

export default localidadesService;
