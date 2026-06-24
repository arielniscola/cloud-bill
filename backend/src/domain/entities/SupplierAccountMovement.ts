import { Decimal } from '@prisma/client/runtime/library';

export type SupplierMovementType = 'DEBIT' | 'CREDIT';
// DEBIT  = compra en CC → debemos dinero al proveedor (balance sube)
// CREDIT = orden de pago → pagamos al proveedor     (balance baja)

// Clasificación del origen del movimiento (para filtros y etiquetas).
export type SupplierMovementKind =
  | 'FC'         // Factura de compra
  | 'NC'         // Nota de crédito
  | 'ND'         // Nota de débito
  | 'OP'         // Orden de pago (pago)
  | 'NOTE'       // Nota interna
  | 'RETENTION'  // Retención
  | 'PURCHASE'   // Compra (sin factura)
  | 'OTHER';

export interface SupplierAccountMovement {
  id: string;
  supplierId: string;
  ordenPagoId: string | null;
  purchaseId: string | null;
  purchaseInvoiceId: string | null;
  type: SupplierMovementType;
  amount: Decimal;
  currency: string;
  balance: Decimal;
  description: string | null;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
  // Enriquecido en getSupplierMovements (no persistido):
  kind?: SupplierMovementKind;
  docNumber?: string | null;
}

export interface SupplierMovementFilters {
  type?: SupplierMovementType;
  kinds?: SupplierMovementKind[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface CreateSupplierMovementInput {
  supplierId: string;
  ordenPagoId?: string;
  purchaseId?: string;
  purchaseInvoiceId?: string;
  type: SupplierMovementType;
  amount: number;
  currency?: string;
  description?: string;
  companyId?: string;
  fiscalMode?: 'FORMAL' | 'INFORMAL';
}
