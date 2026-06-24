import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, ShoppingCart, BarChart2, Package,
  Users, Landmark, ArrowRight, FileText,
} from 'lucide-react';
import { PageHeader } from '../../components/shared';

interface ReportCard {
  title:       string;
  description: string;
  href:        string;
  icon:        React.ElementType;
  color:       string;
  module?:     string;
}

const REPORTS: ReportCard[] = [
  {
    title:       'Ventas',
    description: 'Facturación por período, cliente, vendedor o producto. Exportá el detalle completo.',
    href:        '/reports/sales',
    icon:        TrendingUp,
    color:       'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
  },
  {
    title:       'Compras por proveedor',
    description: 'Total de compras agrupado por proveedor para un período seleccionado.',
    href:        '/reports/purchases',
    icon:        ShoppingCart,
    color:       'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  },
  {
    title:       'Facturas de compras',
    description: 'Detalle de facturas de proveedor con filtros, retenciones y totales pendiente/pagado.',
    href:        '/reports/purchase-invoices',
    icon:        FileText,
    color:       'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  },
  {
    title:       'Rentabilidad de productos',
    description: 'Margen bruto por producto: precio de venta vs. costo. Filtrá por rubro o marca.',
    href:        '/reports/profitability',
    icon:        BarChart2,
    color:       'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  {
    title:       'Valorización de stock',
    description: 'Snapshot del inventario actual: cantidad × costo unitario por producto y depósito.',
    href:        '/reports/stock-valuation',
    icon:        Package,
    color:       'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
  },
  {
    title:       'Cuentas a cobrar',
    description: 'Clientes con saldo pendiente en cuenta corriente. Controlá tu cartera de deudores.',
    href:        '/reports/accounts-receivable',
    icon:        Users,
    color:       'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
  },
  {
    title:       'Flujo de cobros',
    description: 'Recibos emitidos por período: método de pago, caja y monto cobrado.',
    href:        '/reports/cash-flow',
    icon:        Landmark,
    color:       'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
  },
];

export default function ReportsHubPage() {
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle="Generá reportes parametrizados y exportalos a Excel"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.href}
              onClick={() => navigate(r.href)}
              className="group text-left bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl p-5 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-700 transition-all duration-150 flex flex-col gap-4"
            >
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${r.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 dark:text-slate-600 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all duration-150" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{r.title}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 leading-relaxed">{r.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
