import type { Supplier } from './supplier.types';

export type PurchaseRemitoStatus = 'RECEIVED' | 'INVOICED' | 'CANCELLED';

export interface PurchaseRemitoItem {
  id:          string;
  productId:   string | null;
  variantId:   string | null;
  description: string;
  quantity:    number;
  unitPrice:   number;
  productName?: string | null;
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
  items:       PurchaseRemitoItem[];
  itemCount?:  number;
}

export interface CreatePurchaseRemitoItemDTO {
  productId?:   string | null;
  variantId?:   string | null;
  description:  string;
  quantity:     number;
  unitPrice?:   number;
}

export interface CreatePurchaseRemitoDTO {
  supplierId:  string;
  warehouseId: string;
  date?:       string;
  notes?:      string | null;
  items:       CreatePurchaseRemitoItemDTO[];
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
