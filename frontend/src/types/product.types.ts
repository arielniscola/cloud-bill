import type { Rubro } from './rubro.types';
import type { Brand } from './brand.types';
import type { Category } from './category.types';
import type { ProductCustomFieldValue, ProductCustomFieldValueDTO } from './product-custom-field.types';

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  rubroId: string | null;
  rubro?: Rubro;
  brandId: string | null;
  brand?: Brand;
  categoryId: string | null;
  category?: Category;
  supplierId: string | null;
  supplier?: { id: string; name: string };
  barcode: string | null;
  unit: string | null;
  internalNotes: string | null;
  cost: number;
  /** Costo en USD: si está, `cost` se deriva de él (ver costUsdRate). */
  costUSD?: number | null;
  /** Cotización con la que se calculó `cost` desde costUSD. */
  costUsdRate?: number | null;
  price: number;
  salePriceUSD: number | null;
  taxRate: number;
  trackStock: boolean;
  /** El stock se lleva por lote + vencimiento (solo si trackStock). */
  trackLots?: boolean;
  /** URL pública de la imagen — módulo "imagenes". null si no tiene. */
  imageUrl?: string | null;
  priceUpdatedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  customFieldValues?: ProductCustomFieldValue[];
  // Agregado del listado (GET /products): suma de todos los depósitos.
  stockQuantity?: number;
  stockReserved?: number;
  /** Suma de mínimos; null si ningún depósito tiene mínimo definido. */
  stockMinQuantity?: number | null;
}

export interface CreateProductDTO {
  sku: string;
  name: string;
  description?: string | null;
  rubroId?: string | null;
  brandId?: string | null;
  categoryId?: string | null;
  supplierId?: string | null;
  barcode?: string | null;
  unit?: string | null;
  internalNotes?: string | null;
  cost: number;
  costUSD?: number | null;
  /** Cotización elegida para convertir costUSD (editable en la ficha). */
  costUsdRate?: number | null;
  price: number;
  salePriceUSD?: number | null;
  taxRate?: number;
  trackStock?: boolean;
  trackLots?: boolean;
  isActive?: boolean;
  customFields?: ProductCustomFieldValueDTO[];
}

export type UpdateProductDTO = Partial<CreateProductDTO>;

export interface ProductFilters {
  page?: number;
  limit?: number;
  search?: string;
  rubroId?: string;
  brandId?: string;
  categoryId?: string;
  supplierId?: string;
  isActive?: boolean;
  minPrice?: number;
  maxPrice?: number;
  stockState?: StockStateFilter;
  /** El stock que viene en cada producto pasa a ser el de ese depósito. */
  stockWarehouseId?: string;
  sortBy?: ProductSortKey;
  sortOrder?: 'asc' | 'desc';
}

export type StockStateFilter = 'with' | 'low' | 'out';
export type ProductSortKey = 'name' | 'sku' | 'cost' | 'price' | 'priceUpdatedAt';

// ── Historial de precios ─────────────────────────────────────────
export type PriceChangeSource =
  | 'CREATE' | 'MANUAL' | 'BULK' | 'IMPORT' | 'USD_RECALC' | 'PRICE_LIST_RATE' | 'PRICE_LIST_ADJUST' | 'PRICE_LIST_EDIT' | 'PRICE_LIST_IMPORT' | 'PURCHASE_INVOICE' | 'REVERT' | 'OTHER';

export interface PriceChangeValues {
  oldCost: number | null;          newCost: number | null;
  oldPrice: number | null;         newPrice: number | null;
  oldCostUSD: number | null;       newCostUSD: number | null;
  oldSalePriceUSD: number | null;  newSalePriceUSD: number | null;
}

export interface PriceHistoryEntry extends PriceChangeValues {
  id: string;
  source: PriceChangeSource;
  /** Operación a la que pertenece (masiva, importación…) o id de la factura de compra. */
  ref: string | null;
  createdAt: string;
  userName: string | null;
  invoiceNumber: string | null;
}

/** Cambio de precios de varios productos a la vez; se puede deshacer entero. */
export interface PriceOperation {
  ref: string;
  source: PriceChangeSource;
  createdAt: string;
  userName: string | null;
  invoiceNumber: string | null;
  products: number;
  /** Productos que la operación dio de alta (no se deshacen). */
  created: number;
  avgPricePct: number | null;
  avgCostPct: number | null;
  reverted: boolean;
}

export interface PriceOperationItem extends PriceChangeValues {
  id: string;
  productId: string;
  name: string;
  sku: string;
  /** El producto sigue con los valores que dejó la operación (deshacer lo vuelve atrás). */
  isCurrent: boolean;
}

// ── Ficha del producto (GET /products/:id/overview) ──────────────
export interface ProductOverview {
  stock: { warehouseId: string; warehouseName: string; quantity: number; reserved: number; minQuantity: number | null }[];
  movements: {
    id: string; createdAt: string; type: string; quantity: number; newQuantity: number;
    reason: string | null; referenceId: string | null; warehouseName: string; userName: string | null;
  }[];
  /** Últimas compras: facturas de proveedor con el producto y remitos de compra sin facturar. */
  purchases: {
    kind: 'INVOICE' | 'REMITO'; id: string; number: string; date: string;
    supplierId: string | null; supplierName: string | null;
    quantity: number; unitCost: number | null; currency: string; exchangeRate: number;
  }[];
  /** Ventas de los últimos 12 meses, netas de IVA y en pesos. */
  sales: {
    months: { month: string; quantity: number; net: number }[];
    units: number;
    net: number;
    avgUnitPrice: number | null;
    lastSaleDate: string | null;
    topCustomers: { id: string; name: string; quantity: number; net: number }[];
  };
}
