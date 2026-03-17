import { OrdenPago, OrdenPagoWithRelations, CreateOrdenPagoInput } from '../entities/OrdenPago';
import { SupplierAccountMovement, CreateSupplierMovementInput } from '../entities/SupplierAccountMovement';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface OrdenPagoFilters {
  supplierId?: string;
  status?: string;
  paymentMethod?: string;
  companyId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IOrdenPagoRepository {
  findById(id: string): Promise<OrdenPagoWithRelations | null>;
  findAll(pagination: PaginationParams, filters?: OrdenPagoFilters): Promise<PaginatedResult<OrdenPagoWithRelations>>;
  create(data: CreateOrdenPagoInput): Promise<OrdenPagoWithRelations>;
  cancel(id: string): Promise<OrdenPago>;
  getNextNumber(): Promise<string>;

  // Supplier current account
  getSupplierBalance(supplierId: string, companyId?: string): Promise<number>;
  getSupplierMovements(supplierId: string, pagination: PaginationParams, companyId?: string): Promise<PaginatedResult<SupplierAccountMovement>>;
  createSupplierMovement(data: CreateSupplierMovementInput): Promise<SupplierAccountMovement>;
  cancelSupplierMovement(ordenPagoId: string): Promise<void>;
}
