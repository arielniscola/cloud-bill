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
  createdAt: string;
  updatedAt: string;
  // Solo presentes en el listado de SUPER_ADMIN (GET /companies)
  usersCount?: number;
  invoicesThisMonth?: number;
}

export const ALL_MODULE_KEYS = ['ventas', 'catalogo', 'compras', 'finanzas', 'variantes', 'imagenes'] as const;
export type ModuleKey = typeof ALL_MODULE_KEYS[number];

/**
 * Módulos que "ALL" NO incluye: hay que activarlos explícitamente por empresa.
 * Espejo de backend/src/shared/constants/modules.ts — mantener sincronizados.
 *
 * `imagenes` está acá porque consume storage facturable: las empresas ya
 * existentes tienen 'ALL' y no corresponde prendérselo a todas de golpe.
 */
export const OPT_IN_MODULE_KEYS: ModuleKey[] = ['imagenes'];

/** Regla única de "¿este módulo está activo?" — usarla en vez de includes('ALL'). */
export function moduleIsEnabled(enabledModules: string[] | undefined, key: string): boolean {
  const modules = enabledModules ?? ['ALL'];
  if (modules.includes(key)) return true;
  return modules.includes('ALL') && !OPT_IN_MODULE_KEYS.includes(key as ModuleKey);
}

export const MODULE_LABELS: Record<ModuleKey, { label: string; description: string }> = {
  ventas:    { label: 'Ventas',    description: 'Facturas, presupuestos, remitos, recibos, clientes, cuentas corrientes' },
  catalogo:  { label: 'Catálogo',  description: 'Productos, stock, almacenes' },
  compras:   { label: 'Compras',   description: 'Proveedores, órdenes de compra, compras' },
  finanzas:  { label: 'Finanzas',  description: 'Cajas, banco de cheques, libro IVA, reportes' },
  variantes: { label: 'Variantes', description: 'Permite variantes de producto por talle, color u otros atributos (ej. tienda de ropa)' },
  imagenes:  { label: 'Imágenes',  description: 'Foto por producto en el catálogo. Consume almacenamiento — se activa a pedido del cliente' },
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
