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
  lastChangeAt: string | null;
  lastChangeSource: string | null;
  lastOldPrice: number | null;
  lastNewPrice: number | null;
  lastOldCost: number | null;
  lastNewCost: number | null;
}

export interface ImportMatchRow {
  id: string; sku: string; barcode: string | null; name: string; isActive: boolean;
  price: number; cost: number; taxRate: number;
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
  sort?: 'name' | 'sku' | 'price' | 'cost' | 'margin' | 'changed';
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

export interface PriceAdjustInput {
  target: 'PRICE' | 'COST' | 'MARGIN';
  type: 'PERCENT' | 'AMOUNT';
  value: number;
  keepMargin: boolean;
  rounding: 0 | 1 | 10 | 50 | 100;
}

/** Misma cuenta que el backend, para la vista previa. null = el producto queda igual. */
export function previewAdjust(r: { price: number; cost: number }, a: PriceAdjustInput): { price: number; cost: number } | null {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let price = r.price;
  let cost = r.cost;
  if (a.target === 'PRICE') {
    price = Math.max(0, a.type === 'PERCENT' ? r.price * (1 + a.value / 100) : r.price + a.value);
  } else if (a.target === 'COST') {
    cost = Math.max(0, r2(a.type === 'PERCENT' ? r.cost * (1 + a.value / 100) : r.cost + a.value));
    if (a.keepMargin && r.cost > 0) price = r.price * cost / r.cost;
  } else {
    if (!(r.cost > 0)) return null;
    price = r.cost / (1 - a.value / 100);
  }
  price = a.rounding > 0 ? Math.round(price / a.rounding) * a.rounding : r2(price);
  return { price, cost };
}

/** Lista de precios + actualización de precios en pesos con la cotización del día. */
const priceListService = {
  async list(query: PriceListQuery): Promise<PriceListResult> {
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v !== undefined && v !== false));
    const res = await api.get<PriceListResult & { status: string }>('/products/price-list', { params });
    return { data: res.data.data, total: res.data.total, totalPages: res.data.totalPages, summary: res.data.summary };
  },

  /** Ajuste en pesos (sin cotización): precio/costo por % o monto, o margen objetivo. */
  async adjust(body: PriceAdjustInput & { ids?: string[]; filter?: PriceListFilters }): Promise<{ updated: number; skipped: number; ref: string }> {
    const res = await api.post<{ data: { updated: number; skipped: number; ref: string } }>('/products/price-list/adjust', body);
    return res.data.data;
  },

  /** Edición de una celda: un solo valor entre price, cost o margin. */
  async edit(body: { id: string; price?: number; cost?: number; margin?: number; keepMargin?: boolean }): Promise<{ price: number; cost: number }> {
    const res = await api.post<{ data: { price: number; cost: number } }>('/products/price-list/edit', body);
    return res.data.data;
  },

  /** Productos que coinciden por SKU o código de barras con los códigos del archivo. */
  async importMatch(codes: string[]): Promise<ImportMatchRow[]> {
    const res = await api.post<{ data: ImportMatchRow[] }>('/products/price-list/import-match', { codes });
    return res.data.data;
  },

  async importApply(body: { items: Array<{ id: string; cost: number }>; costIncludesTax: boolean; keepMargin: boolean; rounding: 0 | 1 | 10 | 50 | 100 }): Promise<{ updated: number; ref: string }> {
    const res = await api.post<{ data: { updated: number; ref: string } }>('/products/price-list/import-apply', body);
    return res.data.data;
  },

  /** `ids` = productos tildados; o `filter` = todos los que cumplen el filtro. */
  async updateFromRate(body: { mode: PriceListRateMode; rate?: number; ids?: string[]; filter?: PriceListFilters }): Promise<{ updated: number; skipped: number; rate: number; ref: string }> {
    const res = await api.post<{ data: { updated: number; skipped: number; rate: number; ref: string } }>('/products/price-list/update-from-rate', body);
    return res.data.data;
  },
};

export default priceListService;
