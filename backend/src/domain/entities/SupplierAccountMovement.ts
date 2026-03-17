import { Decimal } from '@prisma/client/runtime/library';

export type SupplierMovementType = 'DEBIT' | 'CREDIT';
// DEBIT  = compra en CC → debemos dinero al proveedor (balance sube)
// CREDIT = orden de pago → pagamos al proveedor     (balance baja)

export interface SupplierAccountMovement {
  id: string;
  supplierId: string;
  ordenPagoId: string | null;
  purchaseId: string | null;
  type: SupplierMovementType;
  amount: Decimal;
  currency: string;
  balance: Decimal;
  description: string | null;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSupplierMovementInput {
  supplierId: string;
  ordenPagoId?: string;
  purchaseId?: string;
  type: SupplierMovementType;
  amount: number;
  currency?: string;
  description?: string;
  companyId?: string;
}
