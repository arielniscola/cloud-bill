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

// ── Ficha del cliente (GET /customers/:id/overview) ──────────────
export interface CustomerAging {
  notDue: number; d0_30: number; d31_60: number; d61_90: number; d90plus: number;
  total: number; docCount: number; oldestDays: number;
}

export interface CustomerOverview {
  debt: {
    /** Saldo de cuenta corriente por moneda (positivo = debe; negativo = saldo a favor). */
    balances: { currency: string; balance: number; creditLimit: number | null }[];
    /** Comprobantes impagos por antigüedad, en pesos con el dólar del día. */
    aging: CustomerAging | null;
    exchangeRate: number | null;
    avgPaymentDelayDays: number | null;
  };
  /** Últimos 12 meses, netos de IVA, en pesos con la cotización de cada comprobante. */
  sales: {
    months: { month: string; net: number; docs: number }[];
    net: number;
    docCount: number;
    avgTicket: number | null;
    lastSaleDate: string | null;
    daysSinceLastSale: number | null;
    topProducts: { id: string; name: string; sku: string; quantity: number; net: number; lastDate: string }[];
  };
}
