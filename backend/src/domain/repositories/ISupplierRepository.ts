import { Supplier, CreateSupplierInput, UpdateSupplierInput } from '../entities/Supplier';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface SupplierFilters {
  search?: string;
  isActive?: boolean;
}

export interface ISupplierRepository {
  findAll(pagination?: PaginationParams, filters?: SupplierFilters): Promise<PaginatedResult<Supplier>>;
  findById(id: string): Promise<Supplier | null>;
  create(data: CreateSupplierInput): Promise<Supplier>;
  update(id: string, data: UpdateSupplierInput): Promise<Supplier>;
  delete(id: string): Promise<void>;
}
