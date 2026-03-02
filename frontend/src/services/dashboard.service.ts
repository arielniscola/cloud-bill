import api from './api';
import type { ApiResponse } from '../types';

export interface DashboardStats {
  ventasMes: { total: number; count: number };
  cobrosPendientes: { total: number; count: number };
  cobrosDelMes: { total: number; count: number };
  presupuestosMes: { total: number; count: number };
  comprasMes: { total: number; count: number };
  facturasBorrador: number;
  totalClientes: number;
  totalProductos: number;
  totalProveedores: number;
  remitosPendientes: number;
  recentInvoices: Array<{
    id: string;
    number: string;
    date: string;
    type: string;
    status: string;
    total: number;
    currency: string;
    customer: { id: string; name: string };
  }>;
  recentBudgets: Array<{
    id: string;
    number: string;
    date: string;
    status: string;
    total: number;
    currency: string;
    customer: { id: string; name: string } | null;
  }>;
  pendingRemitos: Array<{
    id: string;
    number: string;
    date: string;
    status: string;
    customer: { id: string; name: string };
  }>;
  customersWithDebt: Array<{
    id: string;
    balance: number;
    currency: string;
    customer: { id: string; name: string };
  }>;
  lowStockItems: Array<{
    id: string;
    quantity: number;
    minQuantity: number;
    product: { id: string; name: string; sku: string };
    warehouse: { id: string; name: string };
  }>;
}

export const dashboardService = {
  async getStats(): Promise<DashboardStats> {
    const response = await api.get<ApiResponse<DashboardStats>>('/dashboard/stats');
    return response.data.data;
  },
};

export default dashboardService;
