import type { Customer } from './customer.types';
import type { Product } from './product.types';
import type { User } from './auth.types';
import type { ItemLotDTO } from './stock.types';

export type RemitoStatus = 'PENDING' | 'PARTIALLY_DELIVERED' | 'DELIVERED' | 'CANCELLED';
export type StockBehavior = 'DISCOUNT' | 'RESERVE';

export interface RemitoItem {
  id: string;
  remitoId: string;
  productId: string;
  variantId?: string | null;
  product?: Product;
  variant?: { id: string; name: string; sku: string; attributes: Record<string, string> } | null;
  quantity: number;
  deliveredQuantity: number;
}

export interface Remito {
  id: string;
  number: string;
  customerId: string;
  customer?: Customer;
  userId: string;
  user?: User;
  invoiceId: string | null;
  budgetId: string | null;
  ordenPedidoId: string | null;
  invoice?: {
    id: string; number: string; type: string;
    afipPtVenta?: number | null; afipCbtNum?: number | null;
    saleCondition?: string; paymentTerms?: string | null;
  } | null;
  budget?: { id: string; number: string } | null;
  /** Factura vigente que facturó este remito libre (null = pendiente de facturar). */
  billedInvoice?: { id: string; number: string; type: string; status: string } | null;
  date: string;
  status: RemitoStatus;
  stockBehavior: StockBehavior;
  fiscalMode?: string;
  notes: string | null;
  transport?: string | null;
  items: RemitoItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRemitoDTO {
  customerId: string;
  notes?: string;
  transport?: string | null;
  invoiceId?: string;
  budgetId?: string;
  // Solo remito libre: depósito del que sale la mercadería (vacío = por defecto).
  warehouseId?: string;
  items: { productId: string; variantId?: string | null; quantity: number; lots?: ItemLotDTO[] }[];
}

export interface DeliverRemitoDTO {
  items: { remitoItemId: string; quantity: number; lots?: ItemLotDTO[] }[];
}

export interface RemitoFilters {
  page?: number;
  limit?: number;
  customerId?: string;
  status?: RemitoStatus;
  dateFrom?: string;
  dateTo?: string;
  ordenPedidoId?: string;
  invoiceId?: string;
  budgetId?: string;
}
