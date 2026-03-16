import { Decimal } from '@prisma/client/runtime/library';

export type OrdenPedidoStatus = 'DRAFT' | 'CONFIRMED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED' | 'CONVERTED';

export interface OrdenPedidoItem {
  id: string;
  ordenPedidoId: string;
  productId: string | null;
  description: string;
  quantity: Decimal;
  unitPrice: Decimal;
  taxRate: Decimal;
  subtotal: Decimal;
  taxAmount: Decimal;
  total: Decimal;
  product?: { id: string; name: string; sku: string } | null;
}

export interface OrdenPedido {
  id: string;
  number: string;
  customerId: string | null;
  userId: string;
  date: Date;
  dueDate: Date | null;
  subtotal: Decimal;
  taxAmount: Decimal;
  total: Decimal;
  currency: string;
  exchangeRate: Decimal;
  status: OrdenPedidoStatus;
  notes: string | null;
  paymentTerms: string | null;
  saleCondition: string;
  stockBehavior: string;
  invoiceId: string | null;
  cashRegisterId: string | null;
  invoiceCashRegisterId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrdenPedidoWithItems extends OrdenPedido {
  items: OrdenPedidoItem[];
  customer?: { id: string; name: string; taxId: string | null; email: string | null; address: string | null } | null;
  user?: { id: string; name: string } | null;
  invoice?: { id: string; number: string; status: string } | null;
  cashRegister?: { id: string; name: string } | null;
  invoiceCashRegister?: { id: string; name: string } | null;
}

export interface CreateOrdenPedidoItemInput {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface CreateOrdenPedidoInput {
  customerId?: string | null;
  userId: string;
  dueDate?: Date | null;
  currency: string;
  exchangeRate: number;
  notes?: string | null;
  paymentTerms?: string | null;
  saleCondition?: string;
  stockBehavior?: string;
  cashRegisterId?: string | null;
  invoiceCashRegisterId?: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  items: CreateOrdenPedidoItemInput[];
}

export interface UpdateOrdenPedidoInput extends Partial<Omit<OrdenPedido, 'id' | 'number' | 'createdAt' | 'updatedAt'>> {
  items?: CreateOrdenPedidoItemInput[];
}
