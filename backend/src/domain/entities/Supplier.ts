import { TaxCondition } from '../../shared/types';

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
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSupplierInput {
  name: string;
  cuit?: string;
  taxCondition?: TaxCondition;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export type UpdateSupplierInput = Partial<CreateSupplierInput & { isActive: boolean }>;
