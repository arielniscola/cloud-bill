import { Decimal } from '@prisma/client/runtime/library';
import { Currency } from '../../shared/types';
import { PaymentMethod } from './Recibo';
import { RetentionBase } from './Supplier';

export type OrdenPagoStatus = 'EMITTED' | 'PAID' | 'CANCELLED';

export interface OrdenPagoItem {
  id: string;
  ordenPagoId: string;
  purchaseId: string | null;
  purchaseInvoiceId: string | null;
  amount: Decimal;
  purchase?: {
    id: string;
    number: string;
    total: Decimal;
    paidAmount: Decimal;
    date: Date;
  };
  invoice?: {
    id: string;
    number: string;
    type: string;
    amount: Decimal;
    status: string;
    currency: string;
  };
}

export interface OrdenPago {
  id: string;
  number: string;
  supplierId: string;
  userId: string;
  cashRegisterId: string | null;
  companyId: string;
  date: Date;
  amount: Decimal;
  currency: Currency;
  exchangeRate: Decimal;
  paymentMethod: PaymentMethod;
  reference: string | null;
  bank: string | null;
  checkDueDate: Date | null;
  notes: string | null;
  status: OrdenPagoStatus;
  // Total retenido. `amount` es el bruto imputado a las facturas; el egreso
  // real de caja/banco es `amount - retentionAmount`.
  retentionAmount: Decimal;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrdenPagoCheque {
  id: string;
  number: string;
  type: string;
  checkNumber: string | null;
  bank: string | null;
  amount: Decimal;
  dueDate: Date | null;
  status: string;
}

export type OrdenPagoAjusteType = 'SUMA' | 'RESTA';

export interface OrdenPagoAjuste {
  id: string;
  ordenPagoId: string;
  accountId: string | null;
  accountCode: string | null;
  description: string;
  type: OrdenPagoAjusteType;
  amount: Decimal;
}

// Retención practicada al pagar. No reduce la deuda con el proveedor: las
// facturas se cancelan por el bruto y este importe queda como impuesto a
// depositar, alimentando el reporte de retenciones.
export interface OrdenPagoRetencion {
  id: string;
  ordenPagoId: string;
  supplierRetentionId: string | null;
  type: string;
  jurisdiction: string | null;
  base: RetentionBase;
  baseAmount: Decimal;
  percentage: Decimal;
  amount: Decimal;
  // Snapshot de los códigos ARCA de la config del proveedor, para SICORE.
  arcaImpuesto: string | null;
  arcaRegimen: string | null;
  certificate: string | null;
  notes: string | null;
}

export interface OrdenPagoWithRelations extends OrdenPago {
  items: OrdenPagoItem[];
  supplier?: { id: string; name: string; cuit: string | null };
  user?: { id: string; name: string };
  cashRegister?: { id: string; name: string } | null;
  cheques?: OrdenPagoCheque[];
  ajustes?: OrdenPagoAjuste[];
  retenciones?: OrdenPagoRetencion[];
}

export interface CreateOrdenPagoItemInput {
  purchaseInvoiceId: string;
  amount: number;
}

export interface CreateOrdenPagoChequePropioInput {
  chequeraId?: string;
  checkNumber?: string;
  bank?: string;
  amount: number;
  dueDate?: string;
}

export interface CreateOrdenPagoRetencionInput {
  supplierRetentionId?: string | null;
  type: string;
  jurisdiction?: string | null;
  base: RetentionBase;
  baseAmount: number;
  percentage: number;
  amount: number;
  arcaImpuesto?: string | null;
  arcaRegimen?: string | null;
  notes?: string | null;
}

export interface CreateOrdenPagoAjusteInput {
  accountId?: string | null;
  accountCode?: string | null;
  description: string;
  type: OrdenPagoAjusteType;
  amount: number;
}

export interface CreateOrdenPagoInput {
  supplierId: string;
  userId: string;
  cashRegisterId?: string;
  companyId?: string;
  date?: Date;
  currency?: Currency;
  exchangeRate?: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  bank?: string;
  checkDueDate?: Date;
  notes?: string;
  items: CreateOrdenPagoItemInput[];
  amount?: number;  // pago a cuenta (sin facturas): importe explícito
  // Ajustes (descuentos / intereses) que modifican el total a pagar
  ajustes?: CreateOrdenPagoAjusteInput[];
  // Retenciones practicadas: NO modifican `amount` (la deuda se cancela por el
  // bruto), solo reducen el egreso de dinero vía `retentionAmount`.
  retenciones?: CreateOrdenPagoRetencionInput[];
  // Pago con cheques
  chequesEnCartera?: string[];                        // ids de cheques INGRESO a endosar
  chequesPropios?: CreateOrdenPagoChequePropioInput[]; // cheques EGRESO a emitir
}
