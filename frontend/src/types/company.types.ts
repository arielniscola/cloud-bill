export interface Company {
  id: string;
  name: string;
  cuit: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  taxCondition: string;
  isActive: boolean;
  logoUrl: string | null;
  enabledModules: string[]; // ['ALL'] or ['ventas','catalogo','compras','finanzas']
  createdAt: string;
  updatedAt: string;
}

export const ALL_MODULE_KEYS = ['ventas', 'catalogo', 'compras', 'finanzas'] as const;
export type ModuleKey = typeof ALL_MODULE_KEYS[number];

export const MODULE_LABELS: Record<ModuleKey, { label: string; description: string }> = {
  ventas:   { label: 'Ventas',    description: 'Facturas, presupuestos, remitos, recibos, clientes, cuentas corrientes' },
  catalogo: { label: 'Catálogo',  description: 'Productos, stock, almacenes' },
  compras:  { label: 'Compras',   description: 'Proveedores, órdenes de compra, compras' },
  finanzas: { label: 'Finanzas',  description: 'Cajas, banco de cheques, libro IVA, reportes' },
};

export interface CreateCompanyDTO {
  name: string;
  cuit?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  taxCondition?: string;
  logoUrl?: string | null;
}

export interface UpdateCompanyDTO extends Partial<CreateCompanyDTO> {
  isActive?: boolean;
}
