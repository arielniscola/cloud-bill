import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Package,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  TrendingUp,
  ShoppingCart,
  Building2,
  Banknote,
  FileText,
  Truck,
  CheckCircle,
  CreditCard,
  ClipboardList,
  Receipt,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
} from 'recharts';
import { Card, Badge } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { dashboardService } from '../../services';
import type { DashboardStats, ChartDataPoint } from '../../services/dashboard.service';
import { remindersService } from '../../services/reminders.service';
import type { RemindersResult } from '../../services/reminders.service';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  INVOICE_STATUS_COLORS,
  INVOICE_STATUSES,
  REMITO_STATUSES,
  REMITO_STATUS_COLORS,
} from '../../utils/constants';

const Skeleton = ({ className }: { className?: string }) => (
  <span className={`inline-block bg-gray-100 dark:bg-slate-700 rounded animate-pulse ${className}`} />
);

function CurrencyTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-700 dark:text-slate-300 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className="text-gray-500 dark:text-slate-400">{p.name}</span>
          </span>
          <span className="font-semibold tabular-nums" style={{ color: p.color }}>
            {formatCurrency(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [charts, setCharts] = useState<ChartDataPoint[]>([]);
  const [reminders, setReminders] = useState<RemindersResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCharts, setIsLoadingCharts] = useState(true);

  useEffect(() => {
    dashboardService
      .getStats()
      .then(setStats)
      .catch((err) => console.error('Error fetching dashboard stats:', err))
      .finally(() => setIsLoading(false));

    dashboardService
      .getCharts()
      .then(setCharts)
      .catch((err) => console.error('Error fetching dashboard charts:', err))
      .finally(() => setIsLoadingCharts(false));

    remindersService
      .getReminders(7)
      .then(setReminders)
      .catch(() => null);
  }, []);

  // ── KPI financieros ──────────────────────────────────────────────────────
  const kpiCards = [
    {
      title: 'Ventas del Mes',
      value: stats?.ventasMes?.total ?? 0,
      subtitle: `${stats?.ventasMes?.count ?? 0} facturas emitidas`,
      icon: TrendingUp,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      border: 'border-emerald-100 dark:border-emerald-900/30',
      href: '/invoices',
      isCurrency: true,
    },
    {
      title: 'Cobros del Mes',
      value: stats?.cobrosDelMes?.total ?? 0,
      subtitle: `${stats?.cobrosDelMes?.count ?? 0} recibos emitidos`,
      icon: Banknote,
      color: 'text-teal-600 dark:text-teal-400',
      bg: 'bg-teal-50 dark:bg-teal-900/20',
      border: 'border-teal-100 dark:border-teal-900/30',
      href: '/recibos',
      isCurrency: true,
    },
    {
      title: 'Compras del Mes',
      value: stats?.comprasMes?.total ?? 0,
      subtitle: `${stats?.comprasMes?.count ?? 0} compras registradas`,
      icon: ShoppingCart,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-100 dark:border-blue-900/30',
      href: '/purchases',
      isCurrency: true,
    },
    {
      title: 'Pagos del Mes',
      value: stats?.pagosMes?.total ?? 0,
      subtitle: `${stats?.pagosMes?.count ?? 0} órdenes de pago`,
      icon: CreditCard,
      color: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-50 dark:bg-violet-900/20',
      border: 'border-violet-100 dark:border-violet-900/30',
      href: '/orden-pagos',
      isCurrency: true,
    },
  ];

  // ── Contadores operacionales ─────────────────────────────────────────────
  const counterCards = [
    {
      title: 'Clientes activos',
      value: stats?.totalClientes ?? 0,
      icon: Users,
      iconBg: 'bg-blue-50 dark:bg-blue-900/20',
      iconColor: 'text-blue-500',
      href: '/customers',
    },
    {
      title: 'Pendientes de cobro',
      value: stats?.cobrosPendientes?.count ?? 0,
      subtitle: stats?.cobrosPendientes?.total
        ? formatCurrency(stats.cobrosPendientes.total)
        : undefined,
      icon: FileText,
      iconBg: 'bg-orange-50 dark:bg-orange-900/20',
      iconColor: 'text-orange-500',
      href: '/invoices?status=ISSUED',
    },
    {
      title: 'Compras a pagar',
      value: stats?.comprasPendientesPago?.count ?? 0,
      subtitle: stats?.comprasPendientesPago?.total
        ? formatCurrency(stats.comprasPendientesPago.total)
        : undefined,
      icon: Receipt,
      iconBg: 'bg-red-50 dark:bg-red-900/20',
      iconColor: 'text-red-500',
      href: '/purchases',
    },
    {
      title: 'Stock bajo',
      value: stats?.lowStockItems.length ?? 0,
      icon: AlertTriangle,
      iconBg: 'bg-amber-50 dark:bg-amber-900/20',
      iconColor: 'text-amber-500',
      href: '/stock',
    },
  ];

  return (
    <div>
      <PageHeader title="Estadísticas" subtitle="Resumen ejecutivo del negocio" />

      {/* ── Banner recordatorios de cobro ───────────────────────────────── */}
      {reminders && reminders.counts.total > 0 && (
        <div className="mb-4 space-y-2">
          {reminders.counts.overdue > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300 flex-1">
                <span className="font-semibold">{reminders.counts.overdue} vencimiento{reminders.counts.overdue !== 1 ? 's' : ''} sin cobrar.</span>
                {' '}Revisá facturas, cheques u órdenes con fecha de cobro superada.
              </p>
              <Link
                to="/invoices?status=ISSUED"
                className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline flex-shrink-0 flex items-center gap-1"
              >
                Ver <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}
          {reminders.counts.critical > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/40">
              <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
              <p className="text-sm text-orange-700 dark:text-orange-300 flex-1">
                <span className="font-semibold">{reminders.counts.critical} cobro{reminders.counts.critical !== 1 ? 's' : ''} vence{reminders.counts.critical === 1 ? '' : 'n'} en los próximos 2 días.</span>
              </p>
            </div>
          )}
          {reminders.counts.warning > 0 && reminders.counts.overdue === 0 && reminders.counts.critical === 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300 flex-1">
                <span className="font-semibold">{reminders.counts.warning} cobro{reminders.counts.warning !== 1 ? 's' : ''} próximo{reminders.counts.warning !== 1 ? 's' : ''} en los próximos 7 días.</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Row 1: KPIs financieros ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {kpiCards.map((card) => (
          <Link key={card.title} to={card.href}>
            <Card className={`border ${card.border} hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group h-full`}>
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">{card.title}</p>
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {isLoading ? <Skeleton className="w-32 h-7" /> : formatCurrency(card.value as number)}
              </p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                {isLoading ? <Skeleton className="w-20 h-3" /> : card.subtitle}
              </p>
              <div className="mt-3 flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                <span>Ver detalle</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── Row 2: Contadores operacionales ────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {counterCards.map((card) => (
          <Link key={card.title} to={card.href}>
            <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${card.iconBg} flex-shrink-0`}>
                  <card.icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{card.title}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {isLoading ? <Skeleton className="w-10 h-5" /> : (card.value ?? 0).toLocaleString('es-AR')}
                  </p>
                  {card.subtitle && !isLoading && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{card.subtitle}</p>
                  )}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── Row 3: Paneles principales ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

        {/* Facturas recientes */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Facturas Recientes</h3>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Últimas emitidas / pagadas</p>
            </div>
            <Link to="/invoices" className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
              Ver todas <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex justify-between items-center">
                  <Skeleton className="w-32 h-4" />
                  <Skeleton className="w-16 h-5" />
                </div>
              ))}
            </div>
          ) : !stats?.recentInvoices.length ? (
            <div className="py-8 text-center">
              <FileText className="w-8 h-8 text-gray-200 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400 dark:text-slate-500">Sin facturas recientes</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {stats.recentInvoices.map((inv) => (
                <Link
                  key={inv.id}
                  to={`/invoices/${inv.id}`}
                  className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{inv.customer.name}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">{inv.number} · {formatDate(inv.date)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-2 flex-shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${INVOICE_STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-800'}`}>
                      {INVOICE_STATUSES[inv.status as keyof typeof INVOICE_STATUSES] ?? inv.status}
                    </span>
                    <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">{formatCurrency(inv.total)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Órdenes de Pago recientes */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Órdenes de Pago</h3>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Últimos pagos a proveedores</p>
            </div>
            <Link to="/orden-pagos" className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
              Ver todos <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex justify-between items-center">
                  <Skeleton className="w-32 h-4" />
                  <Skeleton className="w-16 h-5" />
                </div>
              ))}
            </div>
          ) : !stats?.recentOrdenPagos.length ? (
            <div className="py-8 text-center">
              <CreditCard className="w-8 h-8 text-gray-200 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400 dark:text-slate-500">Sin órdenes de pago recientes</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {stats.recentOrdenPagos.map((op) => (
                <Link
                  key={op.id}
                  to={`/orden-pagos/${op.id}`}
                  className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{op.supplier.name}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">{op.number} · {formatDate(op.date)}</p>
                  </div>
                  <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 ml-2 flex-shrink-0 tabular-nums">
                    {formatCurrency(op.amount, op.currency)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Remitos pendientes de entrega */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Remitos Pendientes</h3>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Entregas por realizar</p>
            </div>
            <Link to="/remitos" className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
              Ver todos <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex justify-between items-center">
                  <Skeleton className="w-32 h-4" />
                  <Skeleton className="w-16 h-5" />
                </div>
              ))}
            </div>
          ) : !stats?.pendingRemitos.length ? (
            <div className="py-8 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-2">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Sin entregas pendientes</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {stats.pendingRemitos.map((r) => (
                <Link
                  key={r.id}
                  to={`/remitos/${r.id}`}
                  className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{r.customer.name}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">{r.number} · {formatDate(r.date)}</p>
                  </div>
                  <span className={`ml-2 flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${REMITO_STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-800'}`}>
                    {REMITO_STATUSES[r.status as keyof typeof REMITO_STATUSES] ?? r.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Row 4: Alertas y deuda ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Alertas de stock bajo */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Alertas de Stock Bajo</h3>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Productos que requieren reposición</p>
            </div>
            <Link to="/stock" className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
              Ver todo <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex justify-between items-center">
                  <Skeleton className="w-40 h-4" />
                  <Skeleton className="w-20 h-5" />
                </div>
              ))}
            </div>
          ) : !stats?.lowStockItems.length ? (
            <div className="py-6 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-2">
                <Package className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Sin alertas de stock</p>
            </div>
          ) : (
            <div className="space-y-1">
              {stats.lowStockItems.map((item) => (
                <Link
                  key={item.id}
                  to="/stock"
                  className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{item.product.name}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{item.warehouse.name} · SKU: {item.product.sku}</p>
                  </div>
                  <Badge variant="warning" dot>
                    {item.quantity} / {item.minQuantity}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Clientes con deuda */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Clientes con Deuda</h3>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Mayores saldos en cuenta corriente</p>
            </div>
            <Link to="/current-accounts" className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
              Ver todas <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex justify-between items-center">
                  <Skeleton className="w-40 h-4" />
                  <Skeleton className="w-24 h-4" />
                </div>
              ))}
            </div>
          ) : !stats?.customersWithDebt.length ? (
            <div className="py-6 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-2">
                <Users className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Sin clientes con deuda en CC</p>
            </div>
          ) : (
            <div className="space-y-1">
              {stats.customersWithDebt.map((ca) => (
                <Link
                  key={ca.id}
                  to="/current-accounts"
                  className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-red-500 dark:text-red-400">
                        {ca.customer.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{ca.customer.name}</p>
                  </div>
                  <span className="text-sm font-semibold text-red-600 dark:text-red-400 ml-2 flex-shrink-0 tabular-nums">
                    {formatCurrency(ca.balance)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Row 5: Contadores secundarios ───────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <Link to="/products">
          <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex-shrink-0">
                <Package className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400">Productos activos</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {isLoading ? <Skeleton className="w-10 h-5" /> : stats?.totalProductos.toLocaleString('es-AR')}
                </p>
              </div>
            </div>
          </Card>
        </Link>
        <Link to="/suppliers">
          <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex-shrink-0">
                <Building2 className="w-5 h-5 text-indigo-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400">Proveedores activos</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {isLoading ? <Skeleton className="w-10 h-5" /> : stats?.totalProveedores.toLocaleString('es-AR')}
                </p>
              </div>
            </div>
          </Card>
        </Link>
        <Link to="/orden-compras">
          <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex-shrink-0">
                <ClipboardList className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400">OC pendientes</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {isLoading ? <Skeleton className="w-10 h-5" /> : (stats?.ocPendientes?.count ?? 0).toLocaleString('es-AR')}
                </p>
                {!isLoading && (stats?.ocPendientes?.total ?? 0) > 0 && (
                  <p className="text-xs text-gray-400 dark:text-slate-500">{formatCurrency(stats!.ocPendientes.total)}</p>
                )}
              </div>
            </div>
          </Card>
        </Link>
        <Link to="/remitos">
          <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex-shrink-0">
                <Truck className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400">Remitos pendientes</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {isLoading ? <Skeleton className="w-10 h-5" /> : (stats?.remitosPendientes ?? 0).toLocaleString('es-AR')}
                </p>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* ── Row 6: Ventas vs Compras vs Cobros vs Pagos ──────────────────── */}
      <div className="mt-4">
        <Card>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Ventas · Compras · Cobros · Pagos — últimos 12 meses</h3>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Facturación, compras, cobros de clientes y pagos a proveedores en ARS</p>
            </div>
          </div>
          {isLoadingCharts ? (
            <div className="h-64 bg-gray-50 dark:bg-slate-700/50 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={charts} barGap={2} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    v >= 1_000_000
                      ? `$${(v / 1_000_000).toFixed(1)}M`
                      : v >= 1_000
                      ? `$${(v / 1_000).toFixed(0)}k`
                      : `$${v}`
                  }
                  width={56}
                />
                <Tooltip content={<CurrencyTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                <Bar dataKey="ventas"  name="Ventas"   fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="compras" name="Compras"  fill="#f59e0b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cobros"  name="Cobros"   fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="pagos"   name="Pagos OP" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── Row 7: Rentabilidad ──────────────────────────────────────────── */}
      <div className="mt-4">
        <Card>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Rentabilidad bruta — últimos 12 meses</h3>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Ganancia = Ventas (facturas) − Compras · Margen sobre ventas</p>
            </div>
            {charts.length > 0 && (() => {
              const last = charts[charts.length - 1];
              return (
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Ganancia este mes</p>
                    <p className={`text-base font-bold tabular-nums ${last.ganancia >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {formatCurrency(last.ganancia)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Margen</p>
                    <p className={`text-base font-bold tabular-nums ${last.margen >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {last.margen}%
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
          {isLoadingCharts ? (
            <div className="h-64 bg-gray-50 dark:bg-slate-700/50 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={charts}>
                <defs>
                  <linearGradient id="gradGanancia" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    v >= 1_000_000
                      ? `$${(v / 1_000_000).toFixed(1)}M`
                      : v >= 1_000
                      ? `$${(v / 1_000).toFixed(0)}k`
                      : `$${v}`
                  }
                  width={56}
                />
                <Tooltip content={<CurrencyTooltip />} />
                <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1.5} />
                <Area
                  type="monotone"
                  dataKey="ganancia"
                  name="Ganancia bruta"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fill="url(#gradGanancia)"
                  dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}
