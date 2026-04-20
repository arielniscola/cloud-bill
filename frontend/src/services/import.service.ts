import api from './api';
import type { ApiResponse } from '../types';

export interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
  errors: Array<{ row: number; message: string }>;
}

export const importService = {
  async importProducts(csv: string): Promise<ImportResult> {
    const res = await api.post<ApiResponse<ImportResult>>('/products/import', { csv });
    return res.data.data;
  },
  async importCustomers(csv: string): Promise<ImportResult> {
    const res = await api.post<ApiResponse<ImportResult>>('/customers/import', { csv });
    return res.data.data;
  },
  async importSuppliers(csv: string): Promise<ImportResult> {
    const res = await api.post<ApiResponse<ImportResult>>('/suppliers/import', { csv });
    return res.data.data;
  },
};

export default importService;
