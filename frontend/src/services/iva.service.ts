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

  /**
   * Descarga los dos archivos de ancho fijo del Libro IVA Digital — Compras
   * (comprobantes + alícuotas) listos para importar en el Portal IVA de ARCA.
   * Devuelve la cantidad de comprobantes incluidos.
   */
  async exportComprasIvaDigital(year: number, month: number): Promise<number> {
    const response = await api.get<
      ApiResponse<{
        period: string;
        count: number;
        cbteFileName: string;
        alicuotasFileName: string;
        cbte: string;
        alicuotas: string;
      }>
    >('/iva/compras/export-iva-digital', { params: { year, month } });

    const { count, cbteFileName, alicuotasFileName, cbte, alicuotas } = response.data.data;

    const saveTxt = (content: string, fileName: string) => {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    };

    saveTxt(cbte, cbteFileName);
    // Pequeño desfasaje para evitar que el navegador bloquee la 2da descarga.
    setTimeout(() => saveTxt(alicuotas, alicuotasFileName), 400);

    return count;
  },
};

export default ivaService;
