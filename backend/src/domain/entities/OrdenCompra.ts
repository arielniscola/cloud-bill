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
  date: Date;
  expectedDate: Date | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  exchangeRate: number;
  status: OrdenCompraStatus;
  warehouseId: string | null;
  notes: string | null;
  purchaseId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrdenCompraWithItems extends OrdenCompra {
  items: OrdenCompraItem[];
  supplier?: { id: string; name: string; email: string | null } | null;
  user?: { id: string; name: string } | null;
  warehouse?: { id: string; name: string } | null;
  purchase?: { id: string } | null;
}

export interface CreateOrdenCompraItemInput {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface CreateOrdenCompraInput {
  supplierId: string;
  userId: string;
  date?: Date;
  expectedDate?: Date | null;
  currency?: string;
  exchangeRate?: number;
  warehouseId?: string | null;
  notes?: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  items: CreateOrdenCompraItemInput[];
}

export interface UpdateOrdenCompraInput extends Partial<Omit<OrdenCompra, 'id' | 'number' | 'createdAt' | 'updatedAt'>> {
  items?: CreateOrdenCompraItemInput[];
}
