import { TaxCondition } from '../../shared/types';

export interface Customer {
  id: string;
  /** Código visible correlativo por empresa (lo asigna el alta; no se edita). */
  code?: number | null;
  name: string;
  taxId: string | null;
  taxCondition: TaxCondition;
  saleCondition: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  grossIncome?: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateCustomerInput = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateCustomerInput = Partial<Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>>;
