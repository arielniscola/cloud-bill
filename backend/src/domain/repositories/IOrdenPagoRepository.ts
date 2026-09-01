import type { Prisma } from '@prisma/client';
import { OrdenPago, OrdenPagoWithRelations, CreateOrdenPagoInput } from '../entities/OrdenPago';
import { SupplierAccountMovement, CreateSupplierMovementInput, SupplierMovementFilters } from '../entities/SupplierAccountMovement';
import { OpenDebitItem, OpenCreditItem, CreateSupplierCcAdjustmentInput, SupplierCcAdjustment } from '../entities/SupplierCcAdjustment';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface OrdenPagoFilters {
  supplierId?: string;
  status?: string;
  paymentMethod?: string;
  companyId?: string;
  fiscalMode?: string;
  currency?: string;
  /** Número de orden o nombre del proveedor. */
  search?: string;
  /** Solo órdenes con retención practicada. */
  onlyRetentions?: boolean;
  /** Solo pagos a cuenta: órdenes sin facturas imputadas. */
  onlyOnAccount?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Totales del período que se está mirando (todo el filtro, no solo la página).
 * Los importes están en ARS: las órdenes en moneda extranjera se convierten con
 * SU cotización, la del momento del pago.
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
  /** Cantidad por estado, para los contadores de las pestañas. */
  statusCounts: { all: number; EMITTED: number; PAID: number; CANCELLED: number };
}

export interface IOrdenPagoRepository {
  findById(id: string, companyId?: string): Promise<OrdenPagoWithRelations | null>;
  findAll(pagination: PaginationParams, filters?: OrdenPagoFilters): Promise<PaginatedResult<OrdenPagoWithRelations>>;
  /** Ignora `status` a propósito: la pestaña de estado no debe vaciar los totales ni los contadores. */
  getSummary(filters?: OrdenPagoFilters): Promise<OrdenPagoSummary>;
  create(data: CreateOrdenPagoInput): Promise<OrdenPagoWithRelations>;
  pay(id: string): Promise<OrdenPagoWithRelations>;
  cancel(id: string): Promise<OrdenPago>;
  getNextNumber(companyId: string, tx?: Prisma.TransactionClient): Promise<string>;

  // Supplier current account — balances are always keyed by currency (e.g. { ARS: 1000, USD: 50 }):
  // a supplier's debt in USD and in ARS are never netted together.
  getSupplierBalance(supplierId: string, companyId?: string, fiscalMode?: string): Promise<Record<string, number>>;
  getSupplierMovements(supplierId: string, pagination: PaginationParams, companyId?: string, filters?: SupplierMovementFilters, fiscalMode?: string): Promise<PaginatedResult<SupplierAccountMovement> & { openingBalance: Record<string, number> }>;
  /** `tx`: cliente de transacción opcional para participar de una transacción externa. */
  createSupplierMovement(data: CreateSupplierMovementInput, tx?: Prisma.TransactionClient): Promise<SupplierAccountMovement>;
  cancelSupplierMovement(ordenPagoId: string, tx?: Prisma.TransactionClient): Promise<void>;
  reverseSupplierMovementByPurchase(purchaseId: string): Promise<void>;
  syncPurchaseInvoiceMovements(purchaseInvoiceId: string): Promise<void>;

  // Imputación manual de cuenta corriente (fuera del flujo de Orden de Pago)
  getOpenAccountItems(supplierId: string, companyId?: string, tx?: Prisma.TransactionClient): Promise<{ debits: OpenDebitItem[]; credits: OpenCreditItem[] }>;
  createCcAdjustment(input: CreateSupplierCcAdjustmentInput): Promise<SupplierCcAdjustment>;
}
