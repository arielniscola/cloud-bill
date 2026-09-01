import type { PaymentMethod } from './recibo.types';
import type { Currency } from './invoice.types';
import type { Supplier, RetentionBase } from './supplier.types';
import type { Purchase, RetentionType } from './purchase.types';

export type OrdenPagoStatus = 'EMITTED' | 'PAID' | 'CANCELLED';

export type SupplierMovementType = 'DEBIT' | 'CREDIT';

export interface OrdenPagoItem {
  id: string;
  ordenPagoId: string;
  purchaseId: string | null;
  purchaseInvoiceId: string | null;
  amount: number;
  purchase?: Pick<Purchase, 'id' | 'number' | 'total' | 'date'> & { paidAmount: number };
  invoice?: { id: string; number: string; type: string; amount: number; status: string };
}

export interface PendingPurchaseInvoice {
  id: string;
  number: string;
  type: string;
  amount: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  dueDate: string | null;
  paymentMethod: string;
  purchaseId: string | null;
  purchaseNumber: string | null;
  purchaseDate: string | null;
  currency: string;
  paidAmount?: number; // ya imputado por OP pagadas (saldo = amount - paidAmount)
}

export interface OrdenPago {
  id: string;
  number: string;
  supplierId: string;
  supplier?: Pick<Supplier, 'id' | 'name' | 'cuit'>;
  userId: string;
  user?: { id: string; name: string };
  cashRegisterId: string | null;
  cashRegister?: { id: string; name: string } | null;
  companyId: string;
  date: string;
  amount: number;
  currency: Currency;
  exchangeRate: number;
  paymentMethod: PaymentMethod;
  reference: string | null;
  bank: string | null;
  checkDueDate: string | null;
  notes: string | null;
  status: OrdenPagoStatus;
  // Total retenido: `amount` es el bruto imputado a las facturas y el egreso
  // real de caja/banco es `amount - retentionAmount`.
  retentionAmount: number;
  items: OrdenPagoItem[];
  cheques?: OrdenPagoCheque[];
  ajustes?: OrdenPagoAjuste[];
  retenciones?: OrdenPagoRetencion[];
  createdAt: string;
  updatedAt: string;
}

// Retención practicada al pagar. No reduce la deuda con el proveedor: la
// factura se cancela por el bruto y el importe queda como impuesto a depositar.
export interface OrdenPagoRetencion {
  id: string;
  ordenPagoId: string;
  supplierRetentionId: string | null;
  type: RetentionType;
  jurisdiction: string | null;
  base: RetentionBase;
  baseAmount: number;
  percentage: number;
  amount: number;
  arcaImpuesto: string | null;
  arcaRegimen: string | null;
  certificate: string | null;
  notes: string | null;
}

export interface CreateOrdenPagoRetencionDTO {
  supplierRetentionId?: string | null;
  type: RetentionType;
  jurisdiction?: string | null;
  base: RetentionBase;
  baseAmount: number;
  percentage: number;
  amount: number;
  arcaImpuesto?: string | null;
  arcaRegimen?: string | null;
  notes?: string | null;
}

export interface OrdenPagoCheque {
  id: string;
  number: string;
  type: string;
  checkNumber: string | null;
  bank: string | null;
  amount: number;
  dueDate: string | null;
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
  amount: number;
}

export type SupplierMovementKind =
  | 'FC' | 'NC' | 'ND' | 'OP' | 'NOTE' | 'RETENTION' | 'PURCHASE' | 'ADJUSTMENT' | 'OTHER';

export interface SupplierAccountMovement {
  id: string;
  supplierId: string;
  ordenPagoId: string | null;
  purchaseId: string | null;
  purchaseInvoiceId: string | null;
  type: SupplierMovementType;
  amount: number;
  currency: string;
  balance: number;
  description: string | null;
  companyId: string;
  createdAt: string;
  updatedAt: string;
  kind?: SupplierMovementKind;
  docNumber?: string | null;
  docDate?: string | null; // fecha del comprobante de origen (createdAt = fecha imputable)
}

export interface SupplierAccount {
  balance: Record<string, number>; // saldo por moneda, p.ej. { ARS: 1000, USD: 50 } — nunca se netean entre sí
  openingBalance: Record<string, number>; // saldo por moneda previo a dateFrom ({} si no hay filtro de fecha)
  data: SupplierAccountMovement[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SupplierMovementFilters {
  page?: number;
  limit?: number;
  type?: SupplierMovementType;
  kinds?: SupplierMovementKind[];
  currency?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface CreateOrdenPagoItemDTO {
  purchaseInvoiceId: string;
  amount: number;
}

export interface CreateOrdenPagoChequePropioDTO {
  chequeraId?: string;
  checkNumber?: string;
  bank?: string;
  amount: number;
  dueDate?: string;
}

export interface CreateOrdenPagoAjusteDTO {
  accountId?: string | null;
  accountCode?: string | null;
  description: string;
  type: OrdenPagoAjusteType;
  amount: number;
}

export interface CreateOrdenPagoDTO {
  supplierId: string;
  cashRegisterId?: string;
  date?: string;
  currency?: Currency;
  exchangeRate?: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  bank?: string;
  checkDueDate?: string;
  notes?: string;
  items: CreateOrdenPagoItemDTO[];
  amount?: number;  // pago a cuenta (sin facturas)
  ajustes?: CreateOrdenPagoAjusteDTO[];
  retenciones?: CreateOrdenPagoRetencionDTO[];
  chequesEnCartera?: string[];
  chequesPropios?: CreateOrdenPagoChequePropioDTO[];
}

// ── Imputación manual de cuenta corriente (fuera del flujo de OP) ──────────

export interface OpenDebitItem {
  purchaseInvoiceId: string;
  number: string;
  type: string;
  currency: string;
  amount: number;
  appliedTotal: number;
  balance: number;
  dueDate: string | null;
}

export interface OpenCreditItem {
  source: 'INVOICE' | 'MOVEMENT';
  purchaseInvoiceId?: string;
  movementId?: string;
  number: string;
  currency: string;
  amount: number;
  appliedTotal: number;
  balance: number;
  date: string;
}

export interface OpenAccountItems {
  debits: OpenDebitItem[];
  credits: OpenCreditItem[];
}

export interface CreateSupplierCcAdjustmentDTO {
  currency: string;
  description?: string;
  debits: { purchaseInvoiceId: string; amount: number }[];
  credits: { purchaseInvoiceId?: string; movementId?: string; amount: number }[];
  manualAmount?: number;
}

export interface OrdenPagoFilters {
  page?: number;
  limit?: number;
  supplierId?: string;
  status?: OrdenPagoStatus;
  paymentMethod?: PaymentMethod;
  currency?: string;
  /** Número de orden o nombre del proveedor. */
  search?: string;
  onlyRetentions?: boolean;
  onlyOnAccount?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Totales de TODO el filtro (no solo la página), en ARS: las órdenes en moneda
 * extranjera se convierten con su propia cotización. Ignoran el filtro de
 * estado, así que los contadores de las pestañas no se vacían al cambiarlas.
 */
export interface OrdenPagoSummary {
  paidArs: number;
  paidCount: number;
  pendingArs: number;
  pendingCount: number;
  retentionArs: number;
  retentionCount: number;
  onAccountArs: number;
  onAccountCount: number;
  statusCounts: { all: number; EMITTED: number; PAID: number; CANCELLED: number };
}
