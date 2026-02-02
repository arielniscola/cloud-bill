import { TaxCondition } from '../../shared/types';

export interface Customer {
  id: string;
  name: string;
  taxId: string | null;
  taxCondition: TaxCondition;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateCustomerInput = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateCustomerInput = Partial<Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>>;
