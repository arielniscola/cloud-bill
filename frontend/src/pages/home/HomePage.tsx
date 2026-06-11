import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  FileText, Users, Calculator, ClipboardList, Receipt,
  Truck, ShoppingCart, Package, PackageSearch, CreditCard,
  Landmark, BookOpen, ArrowRight, SlidersHorizontal,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores';
import { usePermissions } from '../../hooks/usePermissions';
import { useFeatures } from '../../hooks/useFeatures';
import usersService from '../../services/users.service';
import {
  QUICK_ACCESS_CATALOG,
  DEFAULT_QUICK_ACCESS_IDS,
  QUICK_ACCESS_BY_ID,
  type QuickAccessItem,
} from '../../config/quickAccessCatalog';
import QuickAccessConfigModal from '../../components/dashboard/QuickAccessConfigModal';
import type { FeatureKey } from '../../utils/planFeatures';
import type { UserRole } from '../../types';

/* ── Types ────────────────────────────────────────────────────── */
interface ModuleItem {
  name: string;
  description: string;
  href: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  featureKey?: FeatureKey;
  requiredRoles?: readonly UserRole[];
}

interface ModuleGroup {
  label: string;
  moduleKey?: string;
  requiredRoles?: readonly UserRole[];
  items: ModuleItem[];
}

/* ── Data ─────────────────────────────────────────────────────── */
const SALES_ROLES     = ['ADMIN', 'SELLER', 'WAREHOUSE_CLERK', 'FINANCES'] as const;
const PURCHASES_ROLES = ['ADMIN', 'FINANCES', 'PURCHASES'] as const;
const FINANCES_ROLES  = ['ADMIN', 'FINANCES'] as const;

const moduleGroups: ModuleGroup[] = [
  {
    label: 'Ventas',
    moduleKey: 'ventas',
    requiredRoles: SALES_ROLES,
    items: [
      { name: 'Clientes',       description: 'Gestión de clientes y contactos',  href: '/customers',        icon: Users,         iconColor: 'text-blue-600',   iconBg: 'bg-blue-50' },
      { name: 'Presupuestos',   description: 'Cotizaciones y propuestas',         href: '/budgets',          icon: Calculator,    iconColor: 'text-violet-600', iconBg: 'bg-violet-50',   featureKey: 'budgets' },
      { name: 'Facturas',       description: 'Comprobantes de venta',             href: '/invoices',         icon: FileText,      iconColor: 'text-indigo-600', iconBg: 'bg-indigo-50' },
      { name: 'Remitos',        description: 'Entregas de mercadería',            href: '/remitos',          icon: ClipboardList, iconColor: 'text-teal-600',   iconBg: 'bg-teal-50' },
      { name: 'Recibos',        description: 'Pagos y cobros registrados',        href: '/recibos',          icon: Receipt,       iconColor: 'text-emerald-600',iconBg: 'bg-emerald-50' },
    ],
  },
  {
    label: 'Compras',
    moduleKey: 'compras',
    requiredRoles: PURCHASES_ROLES,
    items: [
      { name: 'Proveedores',    description: 'Gestión de proveedores',            href: '/suppliers',        icon: Truck,         iconColor: 'text-orange-600', iconBg: 'bg-orange-50' },
      { name: 'Compras',        description: 'Órdenes de compra e ingresos',      href: '/purchases',        icon: ShoppingCart,  iconColor: 'text-amber-600',  iconBg: 'bg-amber-50' },
    ],
  },
  {
    label: 'Catálogo',
    moduleKey: 'catalogo',
    items: [
      { name: 'Productos',      description: 'Catálogo de artículos y servicios', href: '/products',         icon: Package,       iconColor: 'text-emerald-600',iconBg: 'bg-emerald-50' },
      { name: 'Stock',          description: 'Inventario y movimientos',          href: '/stock',            icon: PackageSearch, iconColor: 'text-lime-600',   iconBg: 'bg-lime-50' },
    ],
  },
  {
    label: 'Finanzas',
    moduleKey: 'finanzas',
    requiredRoles: FINANCES_ROLES,
    items: [
      { name: 'Cuentas Corrientes', description: 'Saldos y deudas de clientes',  href: '/current-accounts', icon: CreditCard,    iconColor: 'text-rose-600',   iconBg: 'bg-rose-50',    featureKey: 'current_accounts' },
      { name: 'Cajas',              description: 'Administración de cajas',        href: '/cash-registers',   icon: Landmark,      iconColor: 'text-sky-600',    iconBg: 'bg-sky-50' },
      { name: 'Libro IVA',          description: 'Registro de comprobantes IVA',   href: '/iva',              icon: BookOpen,      iconColor: 'text-slate-600',  iconBg: 'bg-slate-100',  featureKey: 'iva_book' },
    ],
  },
];

/* ── Component ────────────────────────────────────────────────── */
export default function HomePage() {
  const { user } = useAuthStore();
  const perms = usePermissions();
  const { role, isModuleEnabled } = perms;
  const { hasFeature } = useFeatures();
  const firstName = user?.name?.split(' ')[0] ?? 'usuario';

  // ── Accesos rápidos configurables por usuario ──
  const [shortcutIds, setShortcutIds] = useState<string[] | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Catálogo filtrado por permisos de rol, plan (features) y módulos de empresa
  const availableShortcuts: QuickAccessItem[] = QUICK_ACCESS_CATALOG.filter((it) => {
    if (it.module && !perms.isModuleEnabled(it.module)) return false;
    if (it.feature && !hasFeature(it.feature)) return false;
    if (it.access === 'write' && !perms.canWrite) return false;
    if (it.access === 'purchases' && !perms.canAccessPurchases) return false;
    if (it.access === 'finances' && !perms.canAccessFinances) return false;
    return true;
  });
  const availableIds = new Set(availableShortcuts.map((a) => a.id));

  // Ids efectivos: los del usuario (o el default), siempre filtrados por disponibilidad
  const effectiveIds = (shortcutIds ?? DEFAULT_QUICK_ACCESS_IDS).filter((id) => availableIds.has(id));
  const visibleShortcuts = effectiveIds.map((id) => QUICK_ACCESS_BY_ID[id]).filter(Boolean) as QuickAccessItem[];

  useEffect(() => {
    usersService
      .getDashboardShortcuts()
      .then((ids) => setShortcutIds(ids ?? DEFAULT_QUICK_ACCESS_IDS))
      .catch(() => setShortcutIds(DEFAULT_QUICK_ACCESS_IDS));
  }, []);

  const handleSaveShortcuts = async (ids: string[]) => {
    setSavingConfig(true);
    try {
      const saved = await usersService.saveDashboardShortcuts(ids);
      setShortcutIds(saved);
      setConfigOpen(false);
      toast.success('Accesos rápidos actualizados');
    } catch {
      toast.error('No se pudieron guardar los accesos rápidos');
    } finally {
      setSavingConfig(false);
    }
  };

  if (user?.role === 'SUPER_ADMIN') {
    return <Navigate to="/companies" replace />;
  }

  const visibleModuleGroups = moduleGroups
    .filter((g) => {
      if (g.moduleKey && !isModuleEnabled(g.moduleKey)) return false;
      if (g.requiredRoles && !g.requiredRoles.includes(role)) return false;
      return true;
    })
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => {
        if (i.featureKey && !hasFeature(i.featureKey)) return false;
        if (i.requiredRoles && !i.requiredRoles.includes(role)) return false;
        return true;
      }),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Bienvenido, {firstName}
        </h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">¿Qué querés hacer hoy?</p>
      </div>

      {/* Accesos rápidos (configurables por usuario) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Accesos rápidos</h2>
          <button
            onClick={() => setConfigOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            title="Configurar accesos rápidos"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Editar
          </button>
        </div>
        {visibleShortcuts.length === 0 ? (
          <button
            onClick={() => setConfigOpen(true)}
            className="w-full text-sm text-gray-400 dark:text-slate-500 border border-dashed border-gray-200 dark:border-slate-700 rounded-xl py-6 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors"
          >
            No tenés accesos rápidos configurados. Hacé clic para agregar.
          </button>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3">
            {visibleShortcuts.map(({ id, href, label, icon: Icon, bg, color }) => (
              <Link key={id} to={href}>
                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex flex-col items-center gap-2.5 hover:shadow-sm hover:border-gray-200 dark:hover:border-slate-600 transition-all duration-150 text-center h-full group">
                  <div className={`p-2.5 rounded-xl ${bg} flex-shrink-0 group-hover:scale-105 transition-transform duration-150`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <span className="text-xs font-medium text-gray-600 dark:text-slate-400 group-hover:text-gray-900 dark:group-hover:text-white leading-tight">{label}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Module groups */}
      <div className="space-y-6">
        {visibleModuleGroups.map((group) => (
          <section key={group.label}>
            <h2 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3">
              {group.label}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {group.items.map((mod) => (
                <Link
                  key={mod.href}
                  to={mod.href}
                  className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-100 dark:hover:border-indigo-500 hover:shadow-sm transition-all duration-150 group"
                >
                  <div className={`p-3 rounded-xl ${mod.iconBg} flex-shrink-0`}>
                    <mod.icon className={`w-5 h-5 ${mod.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">
                      {mod.name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 leading-tight">{mod.description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-200 dark:text-slate-600 group-hover:text-indigo-400 flex-shrink-0 transition-colors duration-150" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <QuickAccessConfigModal
        isOpen={configOpen}
        onClose={() => setConfigOpen(false)}
        available={availableShortcuts}
        selectedIds={effectiveIds}
        onSave={handleSaveShortcuts}
        isSaving={savingConfig}
      />
    </div>
  );
}
