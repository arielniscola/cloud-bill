import api from './api';
import type { IvaVentasRow, IvaComprasRow, ApiResponse } from '../types';

export const ivaService = {
  async getVentas(year: number, month: number): Promise<IvaVentasRow[]> {
    const response = await api.get<ApiResponse<IvaVentasRow[]>>('/iva/ventas', {
      params: { year, month },
    });
    return response.data.data;
  },

  async exportVentasCSV(year: number, month: number): Promise<void> {
    const response = await api.get('/iva/ventas/export', {
      params: { year, month },
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `iva-ventas-${year}-${String(month).padStart(2, '0')}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  async getCompras(year: number, month: number): Promise<IvaComprasRow[]> {
    const response = await api.get<ApiResponse<IvaComprasRow[]>>('/iva/compras', {
      params: { year, month },
    });
    return response.data.data;
  },

  async exportComprasCSV(year: number, month: number): Promise<void> {
    const response = await api.get('/iva/compras/export', {
      params: { year, month },
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `iva-compras-${year}-${String(month).padStart(2, '0')}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

export default ivaService;
