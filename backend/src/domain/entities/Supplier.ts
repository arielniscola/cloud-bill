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
  // Retención automática (ej. IIBB 1.5%) — NULL/0 = sin retención automática.
  retentionType: string | null;
  retentionPercentage: number | null;
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
  retentionType?: string | null;
  retentionPercentage?: number | null;
}

export type UpdateSupplierInput = Partial<CreateSupplierInput & { isActive: boolean }>;

// Bases de cálculo de una retención:
//   NETO  → subtotal sin IVA (Ganancias RG 830, IIBB en la mayoría de las jurisdicciones, SUSS)
//   IVA   → el IVA facturado (retención de IVA RG 2854)
//   BRUTO → neto + IVA (IIBB en las jurisdicciones que retienen sobre el total)
export type RetentionBase = 'NETO' | 'IVA' | 'BRUTO';

export interface SupplierRetention {
  id: string;
  supplierId: string;
  companyId: string;
  type: string;              // IIBB | GANANCIAS | IVA | SUSS | OTHER
  jurisdiction: string | null;
  base: RetentionBase;
  percentage: number;
  // Códigos ARCA para el archivo de importación de SICORE. `arcaImpuesto`:
  // 217 Ganancias / 767 IVA. `arcaRegimen`: según la actividad (RG 830, etc.).
  // IIBB es provincial (SIRCAR) y no se exporta a SICORE.
  arcaImpuesto: string | null;
  arcaRegimen: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSupplierRetentionInput {
  supplierId: string;
  companyId: string;
  type: string;
  jurisdiction?: string | null;
  base: RetentionBase;
  percentage: number;
  arcaImpuesto?: string | null;
  arcaRegimen?: string | null;
  isActive?: boolean;
  notes?: string | null;
}

export type UpdateSupplierRetentionInput = Partial<Omit<CreateSupplierRetentionInput, 'supplierId' | 'companyId'>>;
