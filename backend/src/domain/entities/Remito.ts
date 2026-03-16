import { Decimal } from '@prisma/client/runtime/library';
import { RemitoStatus, StockBehavior } from '../../shared/types';

export interface Remito {
  id: string;
  number: string;
  customerId: string;
  userId: string;
  invoiceId: string | null;
  budgetId: string | null;
  ordenPedidoId: string | null;
  date: Date;
  status: RemitoStatus;
  stockBehavior: StockBehavior;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RemitoItem {
  id: string;
  remitoId: string;
  productId: string;
  quantity: Decimal;
  deliveredQuantity: Decimal;
}

export interface RemitoWithItems extends Remito {
  items: RemitoItem[];
  invoice?: { id: string; number: string; type: string } | null;
  budget?: { id: string; number: string } | null;
  ordenPedido?: { id: string; number: string } | null;
}

export interface CreateRemitoItemInput {
  productId: string;
  quantity: number;
}

export interface CreateRemitoInput {
  customerId: string;
  userId: string;
  stockBehavior: StockBehavior;
  notes?: string;
  invoiceId?: string;
  budgetId?: string;
  ordenPedidoId?: string;
  items: CreateRemitoItemInput[];
}

export interface DeliverItemInput {
  remitoItemId: string;
  quantity: number;
}
