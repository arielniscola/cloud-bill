import api from './api';
import type { ApiResponse } from '../types';

// ── Shared ────────────────────────────────────────────────────────────────────
export interface DateRangeParams {
  dateFrom?: string;
  dateTo?:   string;
}

// ── Sales ─────────────────────────────────────────────────────────────────────
export interface ByProductRow {
  productId:    string;
  productName:  string;
  productSku:   string;
  invoiceCount: number;
  quantity:     number;
  unitPriceAvg: number;
  subtotal:     number;
  taxAmount:    number;
  total:        number;
}

export interface SalesReportFilters extends DateRangeParams {
  type?:       string;
  status?:     string;
  currency?:   string;
  customerId?: string;
  userId?:     string;
}

// ── Purchases ─────────────────────────────────────────────────────────────────
export interface PurchaseBySupplierRow {
  supplierId:    string;
  supplierName:  string;
  supplierCuit:  string;
  purchaseCount: number;
  subtotal:      number;
  taxAmount:     number;
  total:         number;
}

export interface PurchasesReportFilters extends DateRangeParams {
  supplierId?: string;
  status?:     string;
}

// ── Purchase Invoices ─────────────────────────────────────────────────────────
export interface PurchaseInvoiceReportRow {
  id:             string;
  number:         string;
  type:           string;
  subtotal:       number;
  taxAmount:      number;
  amount:         number;
  retenciones:    number;
  net:            number;
  dueDate:        string | null;
  imputationDate: string | null;
  paymentMethod:  string;
  status:         'PENDING' | 'PAID';
  notes:          string | null;
  purchaseId:     string;
  purchaseNumber: string;
  purchaseDate:   string | null;
  currency:       string;
  supplierId:     string;
  supplierName:   string;
  supplierCuit:   string;
}

export interface PurchaseInvoiceReportTotals {
  count:        number;
  subtotal:     number;
  taxAmount:    number;
  amount:       number;
  retenciones:  number;
  net:          number;
  pending:      number;
  paid:         number;
}

export type PurchaseInvoiceDateField = 'imputationDate' | 'dueDate' | 'createdAt' | 'purchaseDate';

export interface PurchaseInvoicesReportFilters extends DateRangeParams {
  supplierId?:    string;
  status?:        string;
  paymentMethod?: string;
  dateField?:     PurchaseInvoiceDateField;
}

// ── Profitability ─────────────────────────────────────────────────────────────
export interface ProfitabilityRow {
  productId:  string;
  sku:        string;
  name:       string;
  rubro:   string;
  brand:      string;
  cost:       number;
  price:      number;
  margin:     number;
  marginPct:  number;
}

export interface ProfitabilityFilters {
  rubroId?: string;
  brandId?:    string;
}

// ── Stock Valuation ───────────────────────────────────────────────────────────
export interface StockValuationRow {
  productId:  string;
  sku:        string;
  name:       string;
  rubro:   string;
  warehouse:  string;
  quantity:   number;
  unitCost:   number;
  totalValue: number;
}

export interface StockValuationFilters {
  warehouseId?: string;
  rubroId?:  string;
}

// ── Accounts Receivable ───────────────────────────────────────────────────────
export interface AccountsReceivableRow {
  customerId:   string;
  customerName: string;
  taxId:        string;
  email:        string;
  phone:        string;
  currency:     string;
  balance:      number;
  creditLimit:  number | null;
}

export interface AccountsReceivableFilters {
  currency?:   string;
  minBalance?: number;
}

// ── Cash Flow ─────────────────────────────────────────────────────────────────
export interface CashFlowRow {
  id:             string;
  number:         string;
  date:           string;
  customerName:   string;
  cashRegister:   string;
  paymentMethod:  string;
  currency:       string;
  amount:         number;
  surchargeAmount:number;
  reference:      string;
}

export interface CashFlowFilters extends DateRangeParams {
  cashRegisterId?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────
function clean(params: object): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') out[k] = String(v);
  }
  return out;
}

export const reportsService = {
  async salesByProduct(filters: SalesReportFilters): Promise<ByProductRow[]> {
    const res = await api.get<ApiResponse<ByProductRow[]>>('/reports/sales/by-product', { params: clean(filters) });
    return res.data.data;
  },

  async purchasesBySupplier(filters: PurchasesReportFilters): Promise<{ data: PurchaseBySupplierRow[] }> {
    const res = await api.get<{ status: string; data: PurchaseBySupplierRow[] }>(
      '/reports/purchases/by-supplier', { params: clean(filters) }
    );
    return { data: res.data.data };
  },

  async purchaseInvoices(filters: PurchaseInvoicesReportFilters): Promise<{ data: PurchaseInvoiceReportRow[]; totals: PurchaseInvoiceReportTotals }> {
    const res = await api.get<{ status: string; data: PurchaseInvoiceReportRow[]; totals: PurchaseInvoiceReportTotals }>(
      '/reports/purchase-invoices', { params: clean(filters) }
    );
    return { data: res.data.data, totals: res.data.totals };
  },

  async profitability(filters: ProfitabilityFilters): Promise<ProfitabilityRow[]> {
    const res = await api.get<ApiResponse<ProfitabilityRow[]>>('/reports/profitability', { params: clean(filters) });
    return res.data.data;
  },

  async stockValuation(filters: StockValuationFilters): Promise<{ data: StockValuationRow[]; totalCapital: number }> {
    const res = await api.get<{ status: string; data: StockValuationRow[]; totalCapital: number }>(
      '/reports/stock-valuation', { params: clean(filters) }
    );
    return { data: res.data.data, totalCapital: res.data.totalCapital };
  },

  async accountsReceivable(filters: AccountsReceivableFilters): Promise<{ data: AccountsReceivableRow[]; totalBalance: number }> {
    const res = await api.get<{ status: string; data: AccountsReceivableRow[]; totalBalance: number }>(
      '/reports/accounts-receivable', { params: clean(filters) }
    );
    return { data: res.data.data, totalBalance: res.data.totalBalance };
  },

  async cashFlow(filters: CashFlowFilters): Promise<{ data: CashFlowRow[]; totalAmount: number }> {
    const res = await api.get<{ status: string; data: CashFlowRow[]; totalAmount: number }>(
      '/reports/cash-flow', { params: clean(filters) }
    );
    return { data: res.data.data, totalAmount: res.data.totalAmount };
  },
};

export default reportsService;
