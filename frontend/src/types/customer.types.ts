export type TaxCondition =
  | 'RESPONSABLE_INSCRIPTO'
  | 'MONOTRIBUTISTA'
  | 'EXENTO'
  | 'CONSUMIDOR_FINAL';

export interface Customer {
  id: string;
  /** Código visible correlativo por empresa (lo asigna el alta). */
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
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerDTO {
  name: string;
  taxId?: string | null;
  taxCondition: TaxCondition;
  saleCondition?: string;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  grossIncome?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export type UpdateCustomerDTO = Partial<CreateCustomerDTO>;

export interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
  taxCondition?: TaxCondition;
  saleCondition?: string;
  city?: string;
  isActive?: boolean;
}
