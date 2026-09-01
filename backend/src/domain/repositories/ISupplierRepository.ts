import {
  Supplier, CreateSupplierInput, UpdateSupplierInput,
  SupplierRetention, CreateSupplierRetentionInput, UpdateSupplierRetentionInput,
} from '../entities/Supplier';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface SupplierFilters {
  search?: string;
  isActive?: boolean;
  companyId?: string;
}

export interface ISupplierRepository {
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
