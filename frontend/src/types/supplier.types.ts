import type { TaxCondition } from './customer.types';
import type { RetentionType } from './purchase.types';

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
  // Retención automática (ej. IIBB 1.5%) — NULL/0 = sin retención automática.
  retentionType: RetentionType | null;
  retentionPercentage: number | null;
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
  retentionType?: RetentionType | null;
  retentionPercentage?: number | null;
}

// Base de cálculo de una retención:
//   NETO  → subtotal sin IVA (Ganancias RG 830, IIBB, SUSS)
//   IVA   → el IVA facturado (retención de IVA RG 2854)
//   BRUTO → neto + IVA
export type RetentionBase = 'NETO' | 'IVA' | 'BRUTO';

// Retención configurada para el proveedor. Se propone automáticamente al emitir
// una Orden de Pago, aplicando la alícuota sobre la base elegida.
export interface SupplierRetention {
  id: string;
  supplierId: string;
  companyId: string;
  type: RetentionType;
  jurisdiction: string | null;
  base: RetentionBase;
  percentage: number;
  // Códigos ARCA para el archivo de importación de SICORE (217 Ganancias /
  // 767 IVA + código de régimen). IIBB es provincial y no va a SICORE.
  arcaImpuesto: string | null;
  arcaRegimen: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierRetentionDTO {
  type: RetentionType;
  jurisdiction?: string | null;
  base: RetentionBase;
  percentage: number;
  arcaImpuesto?: string | null;
  arcaRegimen?: string | null;
  isActive?: boolean;
  notes?: string | null;
}

export interface SupplierProductStat {
  id: string;
  name: string;
  sku: string;
  price: number;
  isActive: boolean;
  purchaseCount: number;
  totalQuantity: number;
  lastPurchaseDate: string;
  lastUnitPrice: number;
}

export interface SupplierFilters {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}
