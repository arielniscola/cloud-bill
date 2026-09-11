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
  paid:           number;
  pending:        number;
  dueDate:        string | null;
  imputationDate: string | null;
  invoiceDate:    string | null;
  paymentMethod:  string;
  status:         'PENDING' | 'PARTIALLY_PAID' | 'PAID';
  notes:          string | null;
  purchaseId:     string | null;
  purchaseNumber: string | null;
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
  pending:      number;
  paid:         number;
}

export type PurchaseInvoiceDateField = 'imputationDate' | 'dueDate' | 'createdAt' | 'date' | 'purchaseDate';

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

// ── Deudores a una fecha de corte ────────────────────────────────────────────
// Con `asOf` el mismo endpoint deja de mirar el saldo de hoy y reconstruye
// cuánto se debía a esa fecha a partir de los comprobantes.

export interface DebtorDocumentRow {
  documentId:  string;
  number:      string;
  type:        string;
  date:        string;
  dueDate:     string | null;
  currency:    string;
  total:       number;
  paid:        number;
  /** Saldo del comprobante a la fecha de corte, en su moneda. */
  balance:     number;
  /** Ese mismo saldo convertido a pesos. */
  balanceArs:  number;
  /** Días de atraso a la fecha de corte (0 = todavía no vencía). */
  overdueDays: number;
}

export interface DebtorRow {
  entityId:   string;
  entityName: string;
  taxId:      string | null;
  /** Saldo total a la fecha de corte, en pesos. */
  balanceArs: number;
  /** Saldo por moneda de origen (para no perder el importe real en USD). */
  byCurrency: Record<string, number>;
  notDue:     number;
  d0_30:      number;
  d31_60:     number;
  d61_90:     number;
  d90plus:    number;
  docCount:   number;
  oldestDays: number;
  documents:  DebtorDocumentRow[];
  /** Notas de crédito ya descontadas del saldo. */
  creditsArs: number;
}

export interface DebtorsFilters {
  /** Fecha de corte (YYYY-MM-DD). Es lo que activa este modo del reporte. */
  asOf:        string;
  /**
   * Fecha desde (YYYY-MM-DD), opcional: deja solo los comprobantes EMITIDOS en
   * el período. Sin ella se toma todo el historial hasta el corte.
   */
  from?:       string;
  side?:       'customers' | 'suppliers';
  /**
   * Piso de saldo en ARS (default 0.01): oculta a los deudores cuyo saldo al
   * corte quede por debajo. Sirve para sacar del listado las diferencias de
   * centavos y las deudas chicas que no se van a reclamar.
   */
  minBalance?: number;
}

export interface DebtorsResponse {
  asOf:  string;
  from:  string | null;
  side:  'customers' | 'suppliers';
  data:  DebtorRow[];
  totalBalance: number;
  totals: { notDue: number; d0_30: number; d31_60: number; d61_90: number; d90plus: number };
  exchangeRate: { rate: number; fetchedAt: string; stale: boolean; source: string } | null;
}

// ── Aging de cuentas corrientes ───────────────────────────────────────────────
export interface AgingEntityRow {
  entityId: string;
  name:     string;
  notDue:   number;
  d0_30:    number;
  d31_60:   number;
  d61_90:   number;
  d90plus:  number;
  total:    number;
  docCount: number;
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

// ── Retenciones practicadas ───────────────────────────────────────────────────
// Una fila por retención practicada al pagar. Trae todo lo que necesita el
// archivo de importación de SICORE (comprobante, CUIT del retenido, códigos ARCA).
export interface RetentionReportRow {
  id:              string;
  type:            string;                       // IIBB | GANANCIAS | IVA | SUSS | OTHER
  jurisdiction:    string | null;
  baseKind:        'NETO' | 'IVA' | 'BRUTO';
  baseAmount:      number;
  percentage:      number;
  amount:          number;
  certificate:     string | null;
  arcaImpuesto:    string | null;                // 217 Ganancias / 767 IVA
  arcaRegimen:     string | null;                // según la actividad
  date:            string;                       // fecha de la OP (= fecha de la retención)
  ordenPagoId:     string;
  ordenPagoNumber: string;
  ordenPagoAmount: number;                       // importe del comprobante (bruto imputado)
  ordenPagoStatus: string;
  currency:        string;
  supplierId:      string;
  supplierName:    string;
  supplierCuit:    string | null;
}

export interface RetentionReportTotals {
  count:      number;
  baseAmount: number;
  amount:     number;
}

export interface RetentionReportByType {
  type:       string;
  count:      number;
  baseAmount: number;
  amount:     number;
}

export interface RetentionsReportFilters extends DateRangeParams {
  supplierId?: string;
  type?:       string;
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

  /** Deudores a una fecha de corte (clientes o proveedores). */
  async debtors(filters: DebtorsFilters): Promise<DebtorsResponse> {
    const res = await api.get<{ status: string } & DebtorsResponse>(
      '/reports/accounts-receivable', { params: clean(filters) }
    );
    const { asOf, from, side, data, totalBalance, totals, exchangeRate } = res.data;
    return { asOf, from: from ?? null, side, data, totalBalance, totals, exchangeRate };
  },

  /** Importes en pesos: lo que está en USD se convierte con `exchangeRate`. */
  async ccAging(): Promise<{
    customers: AgingEntityRow[];
    suppliers: AgingEntityRow[];
    exchangeRate: { rate: number; fetchedAt: string; stale: boolean; source: string } | null;
  }> {
    const res = await api.get<{
      status: string;
      customers: AgingEntityRow[];
      suppliers: AgingEntityRow[];
      exchangeRate: { rate: number; fetchedAt: string; stale: boolean; source: string } | null;
    }>('/reports/cc-aging');
    return {
      customers: res.data.customers,
      suppliers: res.data.suppliers,
      exchangeRate: res.data.exchangeRate ?? null,
    };
  },

  async cashFlow(filters: CashFlowFilters): Promise<{ data: CashFlowRow[]; totalAmount: number }> {
    const res = await api.get<{ status: string; data: CashFlowRow[]; totalAmount: number }>(
      '/reports/cash-flow', { params: clean(filters) }
    );
    return { data: res.data.data, totalAmount: res.data.totalAmount };
  },

  async retentions(filters: RetentionsReportFilters): Promise<{
    data: RetentionReportRow[]; totals: RetentionReportTotals; byType: RetentionReportByType[];
  }> {
    const res = await api.get<{
      status: string; data: RetentionReportRow[]; totals: RetentionReportTotals; byType: RetentionReportByType[];
    }>('/reports/retentions', { params: clean(filters) });
    return { data: res.data.data, totals: res.data.totals, byType: res.data.byType };
  },
};

export default reportsService;
