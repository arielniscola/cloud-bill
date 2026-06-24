import {
  FilePlus, FileText, Calculator, ShoppingBag, Truck, Receipt, Users, UserPlus,
  Package, PackagePlus, Boxes, Warehouse, Brain, ClipboardCheck, ShoppingCart,
  Banknote, Wallet, Landmark, BookOpen, BarChart2, CreditCard,
  CircleDollarSign, ArrowLeftRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FeatureKey } from '../utils/planFeatures';

/** Permiso de rol requerido para un acceso (mapea a flags de usePermissions). */
export type QuickAccessRole = 'write' | 'purchases' | 'finances';

export interface QuickAccessItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  bg: string;
  color: string;
  /** Módulo de empresa requerido (Company.enabledModules). */
  module?: 'ventas' | 'catalogo' | 'compras' | 'finanzas';
  /** Feature de plan requerida. */
  feature?: FeatureKey;
  /** Permiso de rol requerido. */
  access?: QuickAccessRole;
}

/** Catálogo maestro de accesos rápidos disponibles para configurar en el dashboard. */
export const QUICK_ACCESS_CATALOG: QuickAccessItem[] = [
  // ── Ventas ──
  { id: 'nueva-factura',     label: 'Nueva factura',    href: '/invoices/new',  icon: FilePlus,    bg: 'bg-indigo-50 dark:bg-indigo-900/30',  color: 'text-indigo-500',  module: 'ventas', access: 'write' },
  { id: 'facturas',          label: 'Facturas',         href: '/invoices',      icon: FileText,    bg: 'bg-indigo-50 dark:bg-indigo-900/30',  color: 'text-indigo-500',  module: 'ventas' },
  { id: 'nuevo-presupuesto', label: 'Nuevo presup.',    href: '/budgets/new',   icon: Calculator,  bg: 'bg-sky-50 dark:bg-sky-900/30',        color: 'text-sky-500',     module: 'ventas', access: 'write', feature: 'budgets' },
  { id: 'presupuestos',      label: 'Presupuestos',     href: '/budgets',       icon: Calculator,  bg: 'bg-sky-50 dark:bg-sky-900/30',        color: 'text-sky-500',     module: 'ventas', feature: 'budgets' },
  { id: 'orden-pedidos',     label: 'Órdenes Pedido',   href: '/orden-pedidos', icon: ShoppingBag, bg: 'bg-violet-50 dark:bg-violet-900/30',  color: 'text-violet-500',  module: 'ventas' },
  { id: 'remitos',           label: 'Remitos',          href: '/remitos',       icon: Truck,       bg: 'bg-cyan-50 dark:bg-cyan-900/30',      color: 'text-cyan-500',    module: 'ventas' },
  { id: 'recibos',           label: 'Recibos',          href: '/recibos',       icon: Receipt,     bg: 'bg-teal-50 dark:bg-teal-900/30',      color: 'text-teal-500',    module: 'ventas' },
  { id: 'clientes',          label: 'Clientes',         href: '/customers',     icon: Users,       bg: 'bg-rose-50 dark:bg-rose-900/30',      color: 'text-rose-500',    module: 'ventas' },
  { id: 'nuevo-cliente',     label: 'Nuevo cliente',    href: '/customers/new', icon: UserPlus,    bg: 'bg-rose-50 dark:bg-rose-900/30',      color: 'text-rose-500',    module: 'ventas', access: 'write' },
  { id: 'cuentas-corrientes',label: 'Ctas. Corrientes', href: '/current-accounts', icon: ArrowLeftRight, bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/30', color: 'text-fuchsia-500', module: 'ventas', feature: 'current_accounts' },

  // ── Catálogo ──
  { id: 'productos',         label: 'Productos',        href: '/products',      icon: Package,      bg: 'bg-emerald-50 dark:bg-emerald-900/30', color: 'text-emerald-500', module: 'catalogo' },
  { id: 'nuevo-producto',    label: 'Nuevo producto',   href: '/products/new',  icon: PackagePlus,  bg: 'bg-emerald-50 dark:bg-emerald-900/30', color: 'text-emerald-500', module: 'catalogo', access: 'write' },
  { id: 'stock',             label: 'Stock',            href: '/stock',         icon: Boxes,        bg: 'bg-amber-50 dark:bg-amber-900/30',     color: 'text-amber-500',   module: 'catalogo' },
  { id: 'almacenes',         label: 'Almacenes',        href: '/warehouses',    icon: Warehouse,    bg: 'bg-blue-50 dark:bg-blue-900/30',       color: 'text-blue-500',    module: 'catalogo' },
  { id: 'stock-inteligente', label: 'Stock Intelig.',   href: '/stock/intelligence',   icon: Brain,          bg: 'bg-orange-50 dark:bg-orange-900/30', color: 'text-orange-500', module: 'catalogo', feature: 'stock_intelligence' },
  { id: 'conteo-fisico',     label: 'Conteo Físico',    href: '/stock/physical-count', icon: ClipboardCheck, bg: 'bg-amber-50 dark:bg-amber-900/30',   color: 'text-amber-500',  module: 'catalogo' },

  // ── Compras ──
  { id: 'compras',           label: 'Facturas Compra',  href: '/purchase-invoices', icon: ShoppingCart, bg: 'bg-purple-50 dark:bg-purple-900/30', color: 'text-purple-500',  module: 'compras', access: 'purchases' },
  { id: 'proveedores',       label: 'Proveedores',      href: '/suppliers',     icon: Truck,        bg: 'bg-purple-50 dark:bg-purple-900/30',   color: 'text-purple-500',  module: 'compras', access: 'purchases' },
  { id: 'orden-pagos',       label: 'Órdenes Pago',     href: '/orden-pagos',   icon: Banknote,     bg: 'bg-purple-50 dark:bg-purple-900/30',   color: 'text-purple-500',  module: 'compras', access: 'purchases' },

  // ── Finanzas ──
  { id: 'cajas',             label: 'Cajas',            href: '/cash-registers', icon: Wallet,      bg: 'bg-green-50 dark:bg-green-900/30',     color: 'text-green-500',   module: 'finanzas', access: 'finances' },
  { id: 'banco-cheques',     label: 'Banco Cheques',    href: '/banco-cheques', icon: Landmark,     bg: 'bg-slate-50 dark:bg-slate-700',        color: 'text-slate-500',   module: 'finanzas', access: 'finances', feature: 'bank_module' },
  { id: 'libro-iva',         label: 'Libro IVA',        href: '/iva',           icon: BookOpen,     bg: 'bg-lime-50 dark:bg-lime-900/30',       color: 'text-lime-600',    module: 'finanzas', access: 'finances', feature: 'iva_book' },
  { id: 'reportes',          label: 'Reportes',         href: '/reports',       icon: BarChart2,    bg: 'bg-emerald-50 dark:bg-emerald-900/30', color: 'text-emerald-500', module: 'finanzas', access: 'finances', feature: 'reports' },
  { id: 'tarjetas',          label: 'Tarjetas',         href: '/cards',         icon: CreditCard,   bg: 'bg-pink-50 dark:bg-pink-900/30',       color: 'text-pink-500',    module: 'finanzas', access: 'finances', feature: 'cards' },
  { id: 'mercadopago',       label: 'MercadoPago',      href: '/mercadopago',   icon: CircleDollarSign, bg: 'bg-sky-50 dark:bg-sky-900/30',     color: 'text-sky-500',     module: 'finanzas', access: 'finances', feature: 'mercadopago' },
];

/** Accesos por defecto cuando el usuario todavía no configuró los suyos. */
export const DEFAULT_QUICK_ACCESS_IDS = [
  'nueva-factura', 'facturas', 'clientes', 'productos',
  'stock', 'presupuestos', 'orden-pedidos', 'recibos',
];

export const QUICK_ACCESS_BY_ID: Record<string, QuickAccessItem> = Object.fromEntries(
  QUICK_ACCESS_CATALOG.map((it) => [it.id, it])
);
