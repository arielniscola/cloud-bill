import api from './api';
import type { ApiResponse } from '../types';

export interface ImportResult {
  imported: number;
  // Desglose de `imported` (solo lo devuelve la importacion de productos):
  // filas que crearon un producto nuevo vs. filas que actualizaron uno existente.
  created?: number;
  updated?: number;
  skipped: number;
  total: number;
  errors: Array<{ row: number; message: string }>;
}

export const importService = {
  // `rowOffset`: cuando el archivo se manda en lotes (ver CsvImportModal), es la
  // cantidad de filas de datos ya procesadas en lotes anteriores — así los
  // números de fila en `errors` coinciden con el archivo original completo.
  async importProducts(csv: string, rowOffset = 0): Promise<ImportResult> {
    const res = await api.post<ApiResponse<ImportResult>>('/products/import', { csv, rowOffset });
    return res.data.data;
  },
  async importCustomers(csv: string, rowOffset = 0): Promise<ImportResult> {
    const res = await api.post<ApiResponse<ImportResult>>('/customers/import', { csv, rowOffset });
    return res.data.data;
  },
  async importSuppliers(csv: string, rowOffset = 0): Promise<ImportResult> {
    const res = await api.post<ApiResponse<ImportResult>>('/suppliers/import', { csv, rowOffset });
    return res.data.data;
  },
  async importBancos(csv: string, rowOffset = 0): Promise<ImportResult> {
    const res = await api.post<ApiResponse<ImportResult>>('/bancos/import', { csv, rowOffset });
    return res.data.data;
  },
};

export default importService;
