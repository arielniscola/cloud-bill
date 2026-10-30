import type { Supplier } from './supplier.types';

/**
 * PENDING_CONFIRMATION: lo cargó depósito y espera que un admin lo confirme
 * (todavía no entró el stock). REJECTED: el admin lo rechazó (nunca entró).
 */
export type PurchaseRemitoStatus = 'RECEIVED' | 'INVOICED' | 'CANCELLED' | 'PENDING_CONFIRMATION' | 'REJECTED';

export interface PurchaseRemitoItem {
  id:          string;
  productId:   string | null;
  variantId:   string | null;
  description: string;
  quantity:    number;
  unitPrice:   number;
  productName?: string | null;
  lotNumber?:  string | null;
  /** 'YYYY-MM-DD' o null. */
  expiresAt?:  string | null;
  /** Lo que cargó depósito, si la recepción pasó por confirmación (quantity/lot/expiresAt = lo confirmado). */
  receivedQuantity?:  number | string | null;
  receivedLotNumber?: string | null;
  receivedExpiresAt?: string | null;
}

export interface PurchaseRemito {
  id:          string;
  number:      string;
  supplierId:  string;
  userId:      string;
  warehouseId: string;
  date:        string;
  status:      PurchaseRemitoStatus;
  notes:       string | null;
  purchaseId:  string | null;
  companyId:   string;
  fiscalMode?: string;
  createdAt:   string;
  updatedAt:   string;
  supplier?:   Pick<Supplier, 'id' | 'name'> & { cuit?: string | null };
  warehouse?:  { id: string; name: string };
  user?:       { id: string; name: string };
  purchase?:   { id: string; number: string } | null;
  confirmedAt?:     string | null;
  confirmedBy?:     { id: string; name: string } | null;
  rejectedAt?:      string | null;
  rejectedBy?:      { id: string; name: string } | null;
  rejectionReason?: string | null;
  items:       PurchaseRemitoItem[];
  itemCount?:  number;
}

export interface CreatePurchaseRemitoItemDTO {
  productId?:   string | null;
  variantId?:   string | null;
  description:  string;
  quantity:     number;
  unitPrice?:   number;
  /** Productos con lotes: lote y vencimiento de lo que entra (sin lote → S/L). */
  lotNumber?:   string | null;
  expiresAt?:   string | null;
  /** Solo de la pantalla: el producto maneja lotes. No viaja al backend. */
  trackLots?:   boolean;
}

export interface CreatePurchaseRemitoDTO {
  supplierId:  string;
  warehouseId: string;
  date?:       string;
  notes?:      string | null;
  items:       CreatePurchaseRemitoItemDTO[];
}

/** Corrección de una línea al confirmar la recepción. */
export interface ConfirmPurchaseRemitoItemDTO {
  id:         string;
  quantity:   number;
  lotNumber?: string | null;
  expiresAt?: string | null;
}

export interface PurchaseRemitoFilters {
  page?:        number;
  limit?:       number;
  supplierId?:  string;
  warehouseId?: string;
  status?:      PurchaseRemitoStatus;
  dateFrom?:    string;
  dateTo?:      string;
  search?:      string;
}
