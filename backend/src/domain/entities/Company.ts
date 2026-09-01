export interface Company {
  id: string;
  name: string;
  cuit: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  taxCondition: string;
  grossIncome: string | null;
  isActive: boolean;
  logoUrl: string | null;
  enabledModules: string[]; // ['ALL'] or ['ventas','catalogo','compras','finanzas']
  plan: string;             // 'STARTER' | 'PRO' | 'ENTERPRISE'
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCompanyInput {
  name: string;
  cuit?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  taxCondition?: string;
  grossIncome?: string | null;
  logoUrl?: string | null;
}

export interface UpdateCompanyInput {
  name?: string;
  cuit?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  taxCondition?: string;
  grossIncome?: string | null;
  isActive?: boolean;
  logoUrl?: string | null;
}
