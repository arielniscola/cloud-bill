import api from './api';
import type { ApiResponse } from '../types';

export interface ByProductRow {
  productId: string;
  productName: string;
  productSku: string;
  invoiceCount: number;
  quantity: number;
  unitPriceAvg: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface SalesReportFilters {
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  status?: string;
  currency?: string;
  customerId?: string;
  userId?: string;
}

export const reportsService = {
  async salesByProduct(filters: SalesReportFilters): Promise<ByProductRow[]> {
    const params: Record<string, string> = {};
    if (filters.dateFrom)   params.dateFrom   = filters.dateFrom;
    if (filters.dateTo)     params.dateTo     = filters.dateTo;
    if (filters.type)       params.type       = filters.type;
    if (filters.status)     params.status     = filters.status;
    if (filters.currency)   params.currency   = filters.currency;
    if (filters.customerId) params.customerId = filters.customerId;
    const res = await api.get<ApiResponse<ByProductRow[]>>('/reports/sales/by-product', { params });
    return res.data.data;
  },
};

export default reportsService;
