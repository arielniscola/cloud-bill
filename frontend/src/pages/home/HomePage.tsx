import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  FileText, Users, Calculator, ClipboardList, Receipt,
  Truck, ShoppingCart, Package, PackageSearch, CreditCard,
  Landmark, BookOpen, ArrowRight, SlidersHorizontal,
  FilePlus, UserPlus, Banknote, Warehouse, BarChart2,
  ChevronRight, Plus, AlertTriangle, Clock, Boxes,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores';
import { usePermissions } from '../../hooks/usePermissions';
import { useFeatures } from '../../hooks/useFeatures';
import usersService from '../../services/users.service';
import stockService from '../../services/stock.service';
import { remindersService } from '../../services/reminders.service';
import type { RemindersResult } from '../../services/reminders.service';
import {
  QUICK_ACCESS_CATALOG,
  DEFAULT_QUICK_ACCESS_IDS,
  QUICK_ACCESS_BY_ID,
  type QuickAccessItem,
} from '../../config/quickAccessCatalog';
import QuickAccessConfigModal from '../../components/dashboard/QuickAccessConfigModal';
import { formatCurrency } from '../../utils/formatters';
import type { FeatureKey } from '../../utils/planFeatures';
import type { UserRole } from '../../types';

/* ── Types ────────────────────────────────────────────────────── */
interface ModuleItem {
  name: string;
  href: string;
  icon: React.ElementType;
  iconColor: string;
  featureKey?: FeatureKey;
  requiredRoles?: readonly UserRole[];
}

interface ModuleGroup {
  label: string;
  moduleKey?: string;
  requiredRoles?: readonly UserRole[];
  items: ModuleItem[];
}

interface AlertItem {
  key: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  href: string;
  className: string;
  iconColor: string;
  titleColor: string;
  subtitleColor: string;
  linkColor: string;
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
      { name: 'Clientes',       href: '/customers',        icon: Users,         iconColor: 'text-blue-600 dark:text-blue-400' },
      { name: 'Presupuestos',   href: '/budgets',          icon: Calculator,    iconColor: 'text-violet-600 dark:text-violet-400', featureKey: 'budgets' },
      { name: 'Facturas',       href: '/invoices',         icon: FileText,      iconColor: 'text-indigo-600 dark:text-indigo-400' },
      { name: 'Remitos',        href: '/remitos',          icon: ClipboardList, iconColor: 'text-teal-600 dark:text-teal-400' },
      { name: 'Recibos',        href: '/recibos',          icon: Receipt,       iconColor: 'text-emerald-600 dark:text-emerald-400' },
    ],
  },
  {
    label: 'Compras',
    moduleKey: 'compras',
    requiredRoles: PURCHASES_ROLES,
    items: [
      { name: 'Proveedores',      href: '/suppliers',   icon: Truck,        iconColor: 'text-orange-600 dark:text-orange-400' },
      { name: 'Compras',          href: '/purchases',   icon: ShoppingCart, iconColor: 'text-amber-600 dark:text-amber-400' },
      { name: 'Órdenes de pago',  href: '/orden-pagos', icon: Banknote,     iconColor: 'text-purple-600 dark:text-purple-400' },
    ],
  },
  {
    label: 'Catálogo',
    moduleKey: 'catalogo',
    items: [
      { name: 'Productos', href: '/products',   icon: Package,       iconColor: 'text-emerald-600 dark:text-emerald-400' },
      { name: 'Stock',     href: '/stock',      icon: PackageSearch, iconColor: 'text-lime-600 dark:text-lime-400' },
      { name: 'Almacenes', href: '/warehouses', icon: Warehouse,     iconColor: 'text-blue-600 dark:text-blue-400' },
    ],
  },
  {
    label: 'Finanzas',
    moduleKey: 'finanzas',
    requiredRoles: FINANCES_ROLES,
    items: [
      { name: 'Cuentas Corrientes', href: '/current-accounts', icon: CreditCard, iconColor: 'text-rose-600 dark:text-rose-400', featureKey: 'current_accounts' },
      { name: 'Cajas',              href: '/cash-registers',   icon: Landmark,   iconColor: 'text-sky-600 dark:text-sky-400' },
      { name: 'Libro IVA',          href: '/iva',              icon: BookOpen,   iconColor: 'text-slate-600 dark:text-slate-400', featureKey: 'iva_book' },
      { name: 'Reportes',           href: '/reports',          icon: BarChart2,  iconColor: 'text-emerald-600 dark:text-emerald-400', featureKey: 'reports' },
    ],
  },
];

/* ── Helpers ──────────────────────────────────────────────────── */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 13) return 'Buen día';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function todayLabel(): string {
  const label = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  return label.charAt(0).toUpperCase() + label.slice(1);
}

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

  // ── Avisos: cobros por vencer y stock bajo ──
  const [reminders, setReminders] = useState<RemindersResult | null>(null);
  const [lowStockCount, setLowStockCount] = useState(0);
  const ventasEnabled = perms.isModuleEnabled('ventas');
  const catalogoEnabled = perms.isModuleEnabled('catalogo');

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

  useEffect(() => {
    if (!ventasEnabled) return;
    remindersService
      .getReminders(7)
      .then(setReminders)
      .catch(() => setReminders(null));
  }, [ventasEnabled]);

  useEffect(() => {
    if (!catalogoEnabled) return;
    stockService
      .getLowStock()
      .then((items) => setLowStockCount(items.length))
      .catch(() => setLowStockCount(0));
  }, [catalogoEnabled]);

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

  // ── Acciones principales del header ──
  const canCreateSales = ventasEnabled && perms.canWrite;

  // ── Avisos visibles ──
  const sumAmount = (urgency: 'overdue' | 'critical') =>
    reminders?.reminders
      .filter((r) => r.urgency === urgency)
      .reduce((sum, r) => sum + (r.amount ?? 0), 0) ?? 0;

  const alerts: AlertItem[] = [];
  if (reminders && reminders.counts.overdue > 0) {
    const n = reminders.counts.overdue;
    alerts.push({
      key: 'overdue',
      icon: AlertTriangle,
      title: `${n} vencimiento${n !== 1 ? 's' : ''} sin cobrar`,
      subtitle: `${formatCurrency(sumAmount('overdue'))} con fecha de cobro superada`,
      href: '/invoices?status=ISSUED',
      className: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40',
      iconColor: 'text-red-500',
      titleColor: 'text-red-700 dark:text-red-300',
      subtitleColor: 'text-red-600 dark:text-red-400',
      linkColor: 'text-red-600 dark:text-red-400',
    });
  }
  if (reminders && reminders.counts.critical > 0) {
    const n = reminders.counts.critical;
    alerts.push({
      key: 'critical',
      icon: Clock,
      title: `${n} cobro${n !== 1 ? 's' : ''} vence${n === 1 ? '' : 'n'} en 2 días`,
      subtitle: `${formatCurrency(sumAmount('critical'))} por cobrar`,
      href: '/invoices?status=ISSUED',
      className: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/40',
      iconColor: 'text-orange-500',
      titleColor: 'text-orange-700 dark:text-orange-300',
      subtitleColor: 'text-orange-600 dark:text-orange-400',
      linkColor: 'text-orange-600 dark:text-orange-400',
    });
  }
  if (lowStockCount > 0) {
    alerts.push({
      key: 'low-stock',
      icon: Boxes,
      title: `${lowStockCount} producto${lowStockCount !== 1 ? 's' : ''} bajo el mínimo`,
      subtitle: 'Revisá el stock disponible por depósito',
      href: '/stock',
      className: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40',
      iconColor: 'text-amber-500',
      titleColor: 'text-amber-700 dark:text-amber-300',
      subtitleColor: 'text-amber-600 dark:text-amber-400',
      linkColor: 'text-amber-600 dark:text-amber-400',
    });
  }

  return (
    <div className="space-y-8">
      {/* Welcome + acciones principales */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {greeting()}, {firstName}
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{todayLabel()}</p>
        </div>

        {canCreateSales && (
          <div className="flex items-center gap-2">
            <Link
              to="/invoices/new"
              className="btn btn-primary h-[38px] px-[18px] font-semibold border border-indigo-700 dark:border-indigo-500 shadow-[0_1px_2px_0_rgba(49,46,129,0.35)]"
            >
              <FilePlus className="w-4 h-4 opacity-85" />
              Nueva factura
            </Link>
            {hasFeature('budgets') && (
              <Link to="/budgets/new" className="btn btn-secondary h-[38px]">
                <Calculator className="w-4 h-4" />
                Presupuesto
              </Link>
            )}
            <Link to="/customers/new" className="btn btn-secondary h-[38px]">
              <UserPlus className="w-4 h-4" />
              Cliente
            </Link>
          </div>
        )}
      </div>

      {/* Requiere tu atención */}
      {alerts.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Requiere tu atención
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {alerts.map((alert) => (
              <Link
                key={alert.key}
                to={alert.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${alert.className}`}
              >
                <alert.icon className={`w-5 h-5 flex-shrink-0 ${alert.iconColor}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-semibold leading-tight ${alert.titleColor}`}>{alert.title}</p>
                  <p className={`text-xs mt-0.5 leading-tight ${alert.subtitleColor}`}>{alert.subtitle}</p>
                </div>
                <span className={`text-xs font-semibold flex items-center gap-1 flex-shrink-0 ${alert.linkColor}`}>
                  Ver <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Accesos rápidos (configurables por usuario) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Tus accesos rápidos</h2>
          <button
            onClick={() => setConfigOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            title="Configurar accesos rápidos"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Editar
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {visibleShortcuts.map(({ id, href, label, icon: Icon, bg, color }) => (
            <Link
              key={id}
              to={href}
              className="flex items-center gap-3 p-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm hover:border-indigo-200 dark:hover:border-indigo-500 hover:shadow-md transition-all duration-150 group"
            >
              <div className={`p-2.5 rounded-xl ${bg} flex-shrink-0 group-hover:scale-105 transition-transform duration-150`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <span className="flex-1 min-w-0 text-[13px] font-medium text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-white leading-tight">
                {label}
              </span>
              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600 group-hover:text-indigo-400 flex-shrink-0 transition-colors" />
            </Link>
          ))}

          <button
            onClick={() => setConfigOpen(true)}
            className="flex items-center justify-center gap-2 p-2.5 min-h-[60px] rounded-xl border border-dashed border-gray-300 dark:border-slate-600 text-[13px] font-medium text-gray-400 dark:text-slate-500 hover:border-indigo-300 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar acceso
          </button>
        </div>
      </section>

      {/* Todos los módulos */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3">
          Todos los módulos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
          {visibleModuleGroups.map((group) => (
            <div key={group.label} className="card p-4 flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                {group.label}
              </h3>
              <div className="flex flex-col gap-0.5">
                {group.items.map((mod) => (
                  <Link
                    key={mod.href}
                    to={mod.href}
                    className="flex items-center gap-2.5 px-2 py-[7px] rounded-lg text-[13px] text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    <mod.icon className={`w-4 h-4 flex-shrink-0 ${mod.iconColor}`} />
                    <span className="truncate">{mod.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

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
