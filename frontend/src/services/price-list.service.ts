import api from './api';

export interface PriceListRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  isActive: boolean;
  /** Precio de venta sin IVA (ARS). */
  price: number;
  /** Costo sin IVA (ARS). */
  cost: number;
  taxRate: number;
  salePriceUSD: number | null;
  costUSD: number | null;
  costUsdRate: number | null;
  priceUpdatedAt: string | null;
  supplierName: string | null;
  categoryName: string | null;
}

export interface PriceListFilters {
  search?: string;
  supplierId?: string;
  categoryId?: string;
  rubroId?: string;
  usd?: 'SALE' | 'COST' | 'ANY';
  includeInactive?: boolean;
}

export interface PriceListQuery extends PriceListFilters {
  page?: number;
  limit?: number;
  sort?: 'name' | 'sku' | 'price' | 'cost' | 'margin';
  dir?: 'asc' | 'desc';
}

export interface PriceListResult {
  data: PriceListRow[];
  total: number;
  totalPages: number;
  summary: {
    total: number;
    withSaleUsd: number;
    withCostUsd: number;
    /** Dólar de la última actualización de un producto en USD de la vista. */
    lastRate: number | null;
    lastRateAt: string | null;
  };
}

export type PriceListRateMode = 'SALE_USD' | 'COST_USD';

/** Lista de precios + actualización de precios en pesos con la cotización del día. */
const priceListService = {
  async list(query: PriceListQuery): Promise<PriceListResult> {
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v !== undefined && v !== false));
    const res = await api.get<PriceListResult & { status: string }>('/products/price-list', { params });
    return { data: res.data.data, total: res.data.total, totalPages: res.data.totalPages, summary: res.data.summary };
  },

  /** `ids` = productos tildados; o `filter` = todos los que cumplen el filtro. */
  async updateFromRate(body: { mode: PriceListRateMode; rate?: number; ids?: string[]; filter?: PriceListFilters }): Promise<{ updated: number; skipped: number; rate: number; ref: string }> {
    const res = await api.post<{ data: { updated: number; skipped: number; rate: number; ref: string } }>('/products/price-list/update-from-rate', body);
    return res.data.data;
  },
};

export default priceListService;
