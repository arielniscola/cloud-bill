import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Package,
  FileText,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  ChevronRight,
  TrendingUp,
  Clock,
  ShoppingCart,
  FilePen,
  Building2,
} from 'lucide-react';
import { Card, Badge } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { dashboardService } from '../../services';
import type { DashboardStats } from '../../services/dashboard.service';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { INVOICE_STATUS_COLORS, INVOICE_STATUSES } from '../../utils/constants';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    dashboardService
      .getStats()
      .then(setStats)
      .catch((err) => console.error('Error fetching dashboard stats:', err))
      .finally(() => setIsLoading(false));
  }, []);

  const kpiCards = [
    {
      title: 'Ventas del Mes',
      value: stats?.ventasMes.total ?? 0,
      subtitle: `${stats?.ventasMes.count ?? 0} facturas`,
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
      href: '/invoices',
    },
    {
      title: 'Cobros Pendientes',
      value: stats?.cobrosPendientes.total ?? 0,
      subtitle: `${stats?.cobrosPendientes.count ?? 0} facturas emitidas`,
      icon: Clock,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      border: 'border-orange-100',
      href: '/invoices?status=ISSUED',
    },
    {
      title: 'Compras del Mes',
      value: stats?.comprasMes.total ?? 0,
      subtitle: `${stats?.comprasMes.count ?? 0} compras`,
      icon: ShoppingCart,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      href: '/purchases',
    },
    {
      title: 'Facturas Borrador',
      value: stats?.facturasBorrador ?? 0,
      subtitle: 'pendientes de emisión',
      icon: FilePen,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      border: 'border-violet-100',
      href: '/invoices?status=DRAFT',
      isCurrency: false,
    },
  ];

  const counterCards = [
    {
      title: 'Clientes',
      value: stats?.totalClientes ?? 0,
      icon: Users,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-500',
      href: '/customers',
    },
    {
      title: 'Productos',
      value: stats?.totalProductos ?? 0,
      icon: Package,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-500',
      href: '/products',
    },
    {
      title: 'Proveedores',
      value: stats?.totalProveedores ?? 0,
      icon: Building2,
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-500',
      href: '/suppliers',
    },
    {
      title: 'Stock Bajo',
      value: stats?.lowStockItems.length ?? 0,
      icon: AlertTriangle,
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-500',
      href: '/stock',
    },
  ];

  const quickActions = [
    { to: '/invoices/new', icon: FileText, label: 'Nueva Factura', color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { to: '/customers/new', icon: Users, label: 'Nuevo Cliente', color: 'text-blue-500', bg: 'bg-blue-50' },
    { to: '/suppliers/new', icon: Building2, label: 'Nuevo Proveedor', color: 'text-violet-500', bg: 'bg-violet-50' },
    { to: '/purchases/new', icon: ShoppingCart, label: 'Nueva Compra', color: 'text-orange-500', bg: 'bg-orange-50' },
    { to: '/products/new', icon: Package, label: 'Nuevo Producto', color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { to: '/stock/transfer', icon: ArrowRightLeft, label: 'Transferir Stock', color: 'text-amber-500', bg: 'bg-amber-50' },
  ];

  const Skeleton = ({ className }: { className?: string }) => (
    <span className={`inline-block bg-gray-100 rounded animate-pulse ${className}`} />
  );

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Resumen ejecutivo del negocio" />

      {/* Row 1 — KPI financieros */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {kpiCards.map((card) => (
          <Link key={card.title} to={card.href}>
            <Card className={`border ${card.border} hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group h-full`}>
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.title}</p>
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </div>
              <p className={`text-2xl font-bold text-gray-900 ${card.isCurrency === false ? '' : ''}`}>
                {isLoading ? (
                  <Skeleton className="w-32 h-7" />
                ) : card.isCurrency === false ? (
                  (card.value as number).toLocaleString('es-AR')
                ) : (
                  formatCurrency(card.value as number)
                )}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {isLoading ? <Skeleton className="w-20 h-3" /> : card.subtitle}
              </p>
              <div className="mt-3 flex items-center gap-1 text-xs text-gray-400 group-hover:text-primary-600 transition-colors">
                <span>Ver detalle</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Row 2 — Contadores secundarios */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {counterCards.map((card) => (
          <Link key={card.title} to={card.href}>
            <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${card.iconBg} flex-shrink-0`}>
                  <card.icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{card.title}</p>
                  <p className="text-xl font-bold text-gray-900">
                    {isLoading ? (
                      <Skeleton className="w-10 h-5" />
                    ) : (
                      (card.value ?? 0).toLocaleString('es-AR')
                    )}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Row 3 — Paneles de detalle */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Facturas recientes */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Facturas Recientes</h3>
              <p className="text-xs text-gray-400 mt-0.5">Últimas 5 emitidas</p>
            </div>
            <Link
              to="/invoices"
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
            >
              Ver todas <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex justify-between items-center">
                  <Skeleton className="w-32 h-4" />
                  <Skeleton className="w-16 h-5" />
                </div>
              ))}
            </div>
          ) : !stats?.recentInvoices.length ? (
            <div className="py-6 text-center">
              <p className="text-sm text-gray-400">Sin facturas recientes</p>
            </div>
          ) : (
            <div className="space-y-1">
              {stats.recentInvoices.map((inv) => (
                <Link
                  key={inv.id}
                  to={`/invoices/${inv.id}`}
                  className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{inv.customer.name}</p>
                    <p className="text-xs text-gray-400">
                      {inv.number} · {formatDate(inv.date)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-2 flex-shrink-0">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${INVOICE_STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-800'}`}
                    >
                      {INVOICE_STATUSES[inv.status as keyof typeof INVOICE_STATUSES] ?? inv.status}
                    </span>
                    <span className="text-xs font-semibold text-gray-700">
                      {formatCurrency(inv.total)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Alertas de stock bajo */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Alertas de Stock Bajo</h3>
              <p className="text-xs text-gray-400 mt-0.5">Productos que requieren atención</p>
            </div>
            <Link
              to="/stock"
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
            >
              Ver todo <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex justify-between items-center">
                  <Skeleton className="w-32 h-4" />
                  <Skeleton className="w-16 h-5" />
                </div>
              ))}
            </div>
          ) : !stats?.lowStockItems.length ? (
            <div className="py-6 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-2">
                <Package className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-sm text-gray-500">Sin alertas de stock</p>
            </div>
          ) : (
            <div className="space-y-1">
              {stats.lowStockItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{item.product.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.warehouse.name}</p>
                  </div>
                  <Badge variant="warning" dot>
                    {item.quantity} / {item.minQuantity}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Clientes con deuda */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Clientes con Deuda</h3>
              <p className="text-xs text-gray-400 mt-0.5">Mayores saldos en cuenta corriente</p>
            </div>
            <Link
              to="/current-accounts"
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
            >
              Ver todas <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex justify-between items-center">
                  <Skeleton className="w-32 h-4" />
                  <Skeleton className="w-20 h-4" />
                </div>
              ))}
            </div>
          ) : !stats?.customersWithDebt.length ? (
            <div className="py-6 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-2">
                <Users className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-sm text-gray-500">Sin clientes con deuda</p>
            </div>
          ) : (
            <div className="space-y-1">
              {stats.customersWithDebt.map((ca) => (
                <div
                  key={ca.id}
                  className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-800 truncate">{ca.customer.name}</p>
                  <span className="text-sm font-semibold text-red-600 ml-2 flex-shrink-0">
                    {formatCurrency(ca.balance)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Row 4 — Acciones rápidas */}
      <Card>
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Acciones Rápidas</h3>
          <p className="text-xs text-gray-400 mt-0.5">Accesos directos frecuentes</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {quickActions.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50/80 transition-all group"
            >
              <div className={`p-2 rounded-lg ${action.bg} flex-shrink-0`}>
                <action.icon className={`w-4 h-4 ${action.color}`} />
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 leading-tight">
                {action.label}
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
