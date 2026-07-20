import type { Prisma } from '@prisma/client';
import { OrdenPago, OrdenPagoWithRelations, CreateOrdenPagoInput } from '../entities/OrdenPago';
import { SupplierAccountMovement, CreateSupplierMovementInput, SupplierMovementFilters } from '../entities/SupplierAccountMovement';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface OrdenPagoFilters {
  supplierId?: string;
  status?: string;
  paymentMethod?: string;
  companyId?: string;
  fiscalMode?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IOrdenPagoRepository {
  findById(id: string, companyId?: string): Promise<OrdenPagoWithRelations | null>;
  findAll(pagination: PaginationParams, filters?: OrdenPagoFilters): Promise<PaginatedResult<OrdenPagoWithRelations>>;
  create(data: CreateOrdenPagoInput): Promise<OrdenPagoWithRelations>;
  pay(id: string): Promise<OrdenPagoWithRelations>;
  cancel(id: string): Promise<OrdenPago>;
  getNextNumber(): Promise<string>;

  // Supplier current account
  getSupplierBalance(supplierId: string, companyId?: string): Promise<number>;
  getSupplierMovements(supplierId: string, pagination: PaginationParams, companyId?: string, filters?: SupplierMovementFilters): Promise<PaginatedResult<SupplierAccountMovement> & { openingBalance: number }>;
  /** `tx`: cliente de transacción opcional para participar de una transacción externa. */
  createSupplierMovement(data: CreateSupplierMovementInput, tx?: Prisma.TransactionClient): Promise<SupplierAccountMovement>;
  cancelSupplierMovement(ordenPagoId: string, tx?: Prisma.TransactionClient): Promise<void>;
  reverseSupplierMovementByPurchase(purchaseId: string): Promise<void>;
  syncPurchaseInvoiceMovements(purchaseInvoiceId: string): Promise<void>;
}
