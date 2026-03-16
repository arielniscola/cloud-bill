export type OrdenCompraStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'RECEIVED' | 'CANCELLED';

export interface OrdenCompraItem {
  id: string;
  ordenCompraId: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  product?: { id: string; name: string; sku: string } | null;
}

export interface OrdenCompra {
  id: string;
  number: string;
  supplierId: string;
  userId: string;
  date: string;
  expectedDate: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  exchangeRate: number;
  status: OrdenCompraStatus;
  warehouseId: string | null;
  notes: string | null;
  purchaseId: string | null;
  createdAt: string;
  updatedAt: string;
  supplier?: { id: string; name: string; email: string | null } | null;
  user?: { id: string; name: string } | null;
  warehouse?: { id: string; name: string } | null;
  purchase?: { id: string } | null;
  items?: OrdenCompraItem[];
}

export interface CreateOrdenCompraItemDTO {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface CreateOrdenCompraDTO {
  supplierId: string;
  date?: string;
  expectedDate?: string | null;
  currency: string;
  exchangeRate: number;
  warehouseId?: string | null;
  notes?: string | null;
  items: CreateOrdenCompraItemDTO[];
}

export interface OrdenCompraFilters {
  page?: number;
  limit?: number;
  supplierId?: string;
  status?: OrdenCompraStatus;
  dateFrom?: string;
  dateTo?: string;
}
