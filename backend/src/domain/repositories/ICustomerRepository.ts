import { Customer, CreateCustomerInput, UpdateCustomerInput } from '../entities/Customer';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface CustomerFilters {
  search?: string;
  taxCondition?: string;
  isActive?: boolean;
}

export interface ICustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByTaxId(taxId: string): Promise<Customer | null>;
  findAll(
    pagination?: PaginationParams,
    filters?: CustomerFilters
  ): Promise<PaginatedResult<Customer>>;
  create(data: CreateCustomerInput): Promise<Customer>;
  update(id: string, data: UpdateCustomerInput): Promise<Customer>;
  delete(id: string): Promise<void>;
}
