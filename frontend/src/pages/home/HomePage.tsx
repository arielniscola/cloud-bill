import { Link } from 'react-router-dom';
import {
  FileText, Users, Calculator, ClipboardList, Receipt,
  Truck, ShoppingCart, Package, PackageSearch, CreditCard,
  Landmark, BookOpen, Plus, ArrowRightLeft, ArrowRight,
} from 'lucide-react';
import { useAuthStore } from '../../stores';

/* ── Types ────────────────────────────────────────────────────── */
interface QuickAction {
  label: string;
  to: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

interface ModuleItem {
  name: string;
  description: string;
  href: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}

interface ModuleGroup {
  label: string;
  items: ModuleItem[];
}

/* ── Data ─────────────────────────────────────────────────────── */
const quickActions: QuickAction[] = [
  { label: 'Nueva Factura',      to: '/invoices/new',    icon: FileText,    color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { label: 'Nuevo Presupuesto',  to: '/budgets/new',     icon: Calculator,  color: 'text-violet-600', bg: 'bg-violet-50' },
  { label: 'Nuevo Cliente',      to: '/customers/new',   icon: Users,       color: 'text-blue-600',   bg: 'bg-blue-50' },
  { label: 'Nuevo Proveedor',    to: '/suppliers/new',   icon: Truck,       color: 'text-orange-600', bg: 'bg-orange-50' },
  { label: 'Nueva Compra',       to: '/purchases/new',   icon: ShoppingCart,color: 'text-amber-600',  bg: 'bg-amber-50' },
  { label: 'Nuevo Producto',     to: '/products/new',    icon: Package,     color: 'text-emerald-600',bg: 'bg-emerald-50' },
  { label: 'Transferir Stock',   to: '/stock/transfer',  icon: ArrowRightLeft, color: 'text-teal-600', bg: 'bg-teal-50' },
];

const moduleGroups: ModuleGroup[] = [
  {
    label: 'Ventas',
    items: [
      { name: 'Clientes',       description: 'Gestión de clientes y contactos',  href: '/customers',        icon: Users,         iconColor: 'text-blue-600',   iconBg: 'bg-blue-50' },
      { name: 'Presupuestos',   description: 'Cotizaciones y propuestas',         href: '/budgets',          icon: Calculator,    iconColor: 'text-violet-600', iconBg: 'bg-violet-50' },
      { name: 'Facturas',       description: 'Comprobantes de venta',             href: '/invoices',         icon: FileText,      iconColor: 'text-indigo-600', iconBg: 'bg-indigo-50' },
      { name: 'Remitos',        description: 'Entregas de mercadería',            href: '/remitos',          icon: ClipboardList, iconColor: 'text-teal-600',   iconBg: 'bg-teal-50' },
      { name: 'Recibos',        description: 'Pagos y cobros registrados',        href: '/recibos',          icon: Receipt,       iconColor: 'text-emerald-600',iconBg: 'bg-emerald-50' },
    ],
  },
  {
    label: 'Compras',
    items: [
      { name: 'Proveedores',    description: 'Gestión de proveedores',            href: '/suppliers',        icon: Truck,         iconColor: 'text-orange-600', iconBg: 'bg-orange-50' },
      { name: 'Compras',        description: 'Órdenes de compra e ingresos',      href: '/purchases',        icon: ShoppingCart,  iconColor: 'text-amber-600',  iconBg: 'bg-amber-50' },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { name: 'Productos',      description: 'Catálogo de artículos y servicios', href: '/products',         icon: Package,       iconColor: 'text-emerald-600',iconBg: 'bg-emerald-50' },
      { name: 'Stock',          description: 'Inventario y movimientos',          href: '/stock',            icon: PackageSearch, iconColor: 'text-lime-600',   iconBg: 'bg-lime-50' },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { name: 'Cuentas Corrientes', description: 'Saldos y deudas de clientes',  href: '/current-accounts', icon: CreditCard,    iconColor: 'text-rose-600',   iconBg: 'bg-rose-50' },
      { name: 'Cajas',              description: 'Administración de cajas',        href: '/cash-registers',   icon: Landmark,      iconColor: 'text-sky-600',    iconBg: 'bg-sky-50' },
      { name: 'Libro IVA',          description: 'Registro de comprobantes IVA',   href: '/iva',              icon: BookOpen,      iconColor: 'text-slate-600',  iconBg: 'bg-slate-100' },
    ],
  },
];

/* ── Component ────────────────────────────────────────────────── */
export default function HomePage() {
  const { user } = useAuthStore();
  const firstName = user?.name?.split(' ')[0] ?? 'usuario';

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bienvenido, {firstName}
        </h1>
        <p className="text-sm text-gray-500 mt-1">¿Qué querés hacer hoy?</p>
      </div>

      {/* Quick actions */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-4 h-4 text-gray-400" />
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones rápidas</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {quickActions.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-150 group text-center"
            >
              <div className={`p-2.5 rounded-xl ${action.bg} group-hover:scale-105 transition-transform duration-150`}>
                <action.icon className={`w-5 h-5 ${action.color}`} />
              </div>
              <span className="text-xs font-medium text-gray-600 group-hover:text-gray-900 leading-tight">
                {action.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Module groups */}
      <div className="space-y-6">
        {moduleGroups.map((group) => (
          <section key={group.label}>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {group.label}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {group.items.map((mod) => (
                <Link
                  key={mod.href}
                  to={mod.href}
                  className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 bg-white hover:border-indigo-100 hover:shadow-sm transition-all duration-150 group"
                >
                  <div className={`p-3 rounded-xl ${mod.iconBg} flex-shrink-0`}>
                    <mod.icon className={`w-5 h-5 ${mod.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">
                      {mod.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-tight">{mod.description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-200 group-hover:text-indigo-400 flex-shrink-0 transition-colors duration-150" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
