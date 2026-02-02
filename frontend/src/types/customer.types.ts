export type TaxCondition =
  | 'RESPONSABLE_INSCRIPTO'
  | 'MONOTRIBUTISTA'
  | 'EXENTO'
  | 'CONSUMIDOR_FINAL';

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
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerDTO {
  name: string;
  taxId?: string | null;
  taxCondition: TaxCondition;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface UpdateCustomerDTO extends Partial<CreateCustomerDTO> {}

export interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
  taxCondition?: TaxCondition;
  isActive?: boolean;
}
