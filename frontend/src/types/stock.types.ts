import type { Product } from './product.types';
import type { Warehouse } from './warehouse.types';
import type { ProductVariant } from './product-variant.types';

export type StockMovementType =
  | 'PURCHASE'
  | 'SALE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'RETURN'
  | 'REMITO_OUT'
  | 'RESERVATION'
  | 'RESERVATION_RELEASE';

export interface Stock {
  id: string;
  productId: string;
  variantId: string | null;
  warehouseId: string;
  product?: Product;
  variant?: ProductVariant | null;
  warehouse?: Warehouse;
  quantity: number;
  reservedQuantity: number;
  minQuantity: number | null;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  variantId: string | null;
  warehouseId: string;
  product?: Product;
  variant?: ProductVariant | null;
  warehouse?: Warehouse;
  type: StockMovementType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string | null;
  referenceId: string | null;
  userId: string | null;
  relatedWarehouseId: string | null;
  createdAt: string;
  partyName?: string | null;
}

/** Lote pedido en un movimiento: salida por `lotId`; entrada con `lotNumber` + `expiresAt`. */
export interface LotSpecDTO {
  lotId?: string;
  lotNumber?: string;
  expiresAt?: string | null;
  quantity: number;
}

/** Lote elegido para una línea de venta. */
export interface ItemLotDTO {
  lotId: string;
  quantity: number;
}

/** Lotes elegidos en un comprobante, agregados por producto + variante. */
export interface LotSelection {
  productId: string;
  variantId: string | null;
  lots: ItemLotDTO[];
}

export interface CreateStockMovementDTO {
  productId: string;
  warehouseId: string;
  type: StockMovementType;
  quantity: number;
  reason?: string;
  referenceId?: string;
  variantId?: string | null;
  lots?: LotSpecDTO[];
}

export interface StockTransferDTO {
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  reason?: string;
  variantId?: string | null;
  lots?: LotSpecDTO[];
}

export interface StockLot {
  id: string;
  productId: string;
  variantId: string | null;
  warehouseId: string;
  lotNumber: string;
  /** 'YYYY-MM-DD' o null. */
  expiresAt: string | null;
  quantity: number;
  createdAt: string;
  productSku: string;
  productName: string;
  productUnit: string | null;
  variantName: string | null;
  warehouseName: string;
  /** Días hasta el vencimiento (negativo = vencido); null sin vencimiento. */
  daysToExpiry: number | null;
}

export interface StockLotFilters {
  productId?: string;
  variantId?: string;
  warehouseId?: string;
  search?: string;
  /** 'expired' o días ('30', '60', '90'). */
  expiry?: string;
  withStock?: boolean;
}

export interface StockLotMovement {
  id: string;
  type: StockMovementType;
  createdAt: string;
  reason: string | null;
  referenceId: string | null;
  quantity: number;
  outgoing: boolean;
  documentNumber: string | null;
  documentType: 'INVOICE' | 'REMITO' | 'ORDEN_PEDIDO' | 'PURCHASE_REMITO' | null;
  customerName: string | null;
  customerId: string | null;
  supplierName: string | null;
}

export interface StockLotTrace {
  id: string;
  lotNumber: string;
  expiresAt: string | null;
  quantity: number;
  productId: string;
  productName: string;
  productSku: string;
  warehouseName: string;
  movements: StockLotMovement[];
}

/** Lotes entregados por un comprobante, por producto/variante. */
export interface DocumentLot {
  productId: string;
  variantId: string | null;
  lotNumber: string;
  expiresAt: string | null;
  quantity: number;
}

export interface SetMinQuantityDTO {
  minQuantity: number | null;
}

export interface StockMovementFilters {
  page?: number;
  limit?: number;
  productId?: string;
  warehouseId?: string;
  type?: StockMovementType;
  startDate?: string;
  endDate?: string;
}

export interface BulkAdjustItem {
  productId: string;
  variantId?: string | null;
  newQuantity: number;
}

export interface BulkAdjustDTO {
  warehouseId: string;
  items: BulkAdjustItem[];
  reason: string;
}
