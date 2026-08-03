import { Decimal } from '@prisma/client/runtime/library';

export type SupplierCcAdjustmentSide = 'DEBIT' | 'CREDIT';

export interface SupplierCcAdjustmentItem {
  id: string;
  adjustmentId: string;
  side: SupplierCcAdjustmentSide;
  purchaseInvoiceId: string | null;
  movementId: string | null;
  amount: Decimal;
  // Enriquecido para display (no persistido)
  docNumber?: string | null;
  docType?: string | null;
}

export interface SupplierCcAdjustment {
  id: string;
  supplierId: string;
  companyId: string;
  fiscalMode: string | null;
  currency: string;
  manualAmount: Decimal;
  description: string | null;
  userId: string;
  createdAt: Date;
  items: SupplierCcAdjustmentItem[];
}

// Débito abierto: factura o ND pendiente/parcial (deuda al proveedor).
export interface OpenDebitItem {
  purchaseInvoiceId: string;
  number: string;
  type: string;
  currency: string;
  amount: number;
  appliedTotal: number;
  balance: number;
  dueDate: Date | null;
}

// Crédito disponible: NC pendiente/parcial, o movimiento CREDIT suelto
// (pago a cuenta / remanente de un ajuste previo) sin factura asociada.
export interface OpenCreditItem {
  source: 'INVOICE' | 'MOVEMENT';
  purchaseInvoiceId?: string;
  movementId?: string;
  number: string;      // número de NC, o descripción del movimiento
  currency: string;
  amount: number;
  appliedTotal: number;
  balance: number;
  date: Date;
}

export interface CreateSupplierCcAdjustmentInput {
  supplierId: string;
  companyId: string;
  fiscalMode?: 'FORMAL' | 'INFORMAL';
  currency: string;
  userId: string;
  description?: string;
  debits: { purchaseInvoiceId: string; amount: number }[];
  credits: { purchaseInvoiceId?: string; movementId?: string; amount: number }[];
  manualAmount?: number;
}
