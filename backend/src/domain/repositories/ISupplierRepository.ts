import {
  Supplier, CreateSupplierInput, UpdateSupplierInput,
  SupplierRetention, CreateSupplierRetentionInput, UpdateSupplierRetentionInput,
} from '../entities/Supplier';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export type SupplierSortBy = 'name' | 'balance' | 'purchased12m' | 'lastPurchase';

export interface SupplierFilters {
  search?: string;
  isActive?: boolean;
  companyId?: string;
  fiscalMode?: string;
  /** Solo proveedores con saldo de cuenta corriente a pagar (ARS). */
  hasBalance?: boolean;
  /** Solo proveedores con al menos una factura vencida impaga. */
  hasOverdue?: boolean;
  /** Orden. Los tres financieros se resuelven en SQL para que ordenen el total,
   *  no la página que se está mostrando. */
  sortBy?: SupplierSortBy;
  sortDir?: 'asc' | 'desc';
}

/**
 * Agregados de cuenta corriente y compras por proveedor. Alimentan el listado
 * (`/suppliers/summary`) y la ficha (`/suppliers/:id/summary`) sin que el front
 * tenga que pedir la cuenta de cada proveedor por separado.
 *
 * Todos los importes en ARS: los comprobantes en USD se convierten con la
 * cotización guardada EN EL COMPROBANTE (no la del día), que es la que ya usa
 * la imputación de órdenes de pago.
 */
export interface SupplierAging {
  notDue: number;   // aún no vencido
  d1_30: number;    // vencido 1-30 días
  d31_60: number;   // vencido 31-60 días
  d60plus: number;  // vencido +60 días
}

export interface SupplierSummary {
  supplierId: string;
  /** Saldo de cuenta corriente por moneda (positivo = le debemos al proveedor). */
  balance: Record<string, number>;
  /** Pendiente de facturas/ND abiertas, en ARS. */
  pendingAmount: number;
  pendingCount: number;
  overdueAmount: number;
  overdueCount: number;
  nextDueDate: string | null;
  lastPurchaseDate: string | null;
  /** Comprado en los últimos 12 meses (facturas + ND − NC), en ARS. */
  purchased12m: number;
  aging: SupplierAging;
}

export interface ISupplierRepository {
  /** Agregados de varios proveedores de una sola pasada (listado). */
  getSummaries(ids: string[], companyId?: string, fiscalMode?: string): Promise<Record<string, SupplierSummary>>;
  findAll(pagination?: PaginationParams, filters?: SupplierFilters): Promise<PaginatedResult<Supplier>>;
  findById(id: string, companyId?: string): Promise<Supplier | null>;
  /** El CUIT es único por empresa: sin `companyId` la búsqueda cruzaría cuentas. */
  findByCuit(cuit: string, companyId?: string): Promise<Supplier | null>;
  create(data: CreateSupplierInput): Promise<Supplier>;
  update(id: string, data: UpdateSupplierInput): Promise<Supplier>;
  delete(id: string): Promise<void>;

  // Retenciones configuradas para el proveedor (se aplican al pagar)
  findRetentions(supplierId: string, companyId?: string, onlyActive?: boolean): Promise<SupplierRetention[]>;
  findRetentionById(id: string, companyId?: string): Promise<SupplierRetention | null>;
  createRetention(data: CreateSupplierRetentionInput): Promise<SupplierRetention>;
  updateRetention(id: string, data: UpdateSupplierRetentionInput): Promise<SupplierRetention>;
  deleteRetention(id: string): Promise<void>;
}
