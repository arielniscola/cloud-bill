import type { TaxCondition } from './customer.types';

export interface Supplier {
  id: string;
  name: string;
  cuit: string | null;
  taxCondition: TaxCondition;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierDTO {
  name: string;
  cuit?: string;
  taxCondition?: TaxCondition;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  notes?: string;
  isActive?: boolean;
}

export interface SupplierFilters {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}
