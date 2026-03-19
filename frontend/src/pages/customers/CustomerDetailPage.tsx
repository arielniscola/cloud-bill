import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Edit, FileText, ClipboardList, Truck, ArrowRight, Mail, Phone, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { customersService, invoicesService, remitosService, ordenPedidosService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { INVOICE_STATUSES, INVOICE_TYPES, REMITO_STATUSES, ORDEN_PEDIDO_STATUSES, TAX_CONDITIONS } from '../../utils/constants';
import type { Customer, Invoice, InvoiceStatus, InvoiceType } from '../../types';
import type { Remito } from '../../types';
import type { OrdenPedido, OrdenPedidoStatus } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';

// ── Badge variants ──────────────────────────────────────────────
const INVOICE_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  ISSUED: 'warning',
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  DRAFT: 'default',
  CANCELLED: 'error',
};

const REMITO_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  PENDING: 'default',
  DELIVERED: 'success',
  PARTIALLY_DELIVERED: 'warning',
  CANCELLED: 'error',
};

const OP_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  DRAFT: 'default',
  CONFIRMED: 'info' as any,
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  CANCELLED: 'error',
  CONVERTED: 'info' as any,
};

// ── Skeleton ────────────────────────────────────────────────────
function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-3.5">
          <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded" />
        </td>
      ))}
    </tr>
  );
}

// ── Tab types ───────────────────────────────────────────────────
type Tab = 'invoices' | 'ordenPedidos' | 'remitos';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'invoices', label: 'Facturas', icon: FileText },
  { id: 'ordenPedidos', label: 'Órdenes de Pedido', icon: ClipboardList },
  { id: 'remitos', label: 'Remitos', icon: Truck },
];

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canWrite } = usePermissions();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('invoices');

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesTotal, setInvoicesTotal] = useState(0);

  const [ordenPedidos, setOrdenPedidos] = useState<OrdenPedido[]>([]);
  const [opLoading, setOpLoading] = useState(false);
  const [opTotal, setOpTotal] = useState(0);

  const [remitos, setRemitos] = useState<Remito[]>([]);
  const [remitosLoading, setRemitosLoading] = useState(false);
  const [remitosTotal, setRemitosTotal] = useState(0);

  // ── Load customer ──────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    customersService.getById(id)
      .then(setCustomer)
      .catch(() => { toast.error('Error al cargar cliente'); navigate('/customers'); })
      .finally(() => setIsLoading(false));
  }, [id, navigate]);

  // ── Load tab data ──────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;

    if (tab === 'invoices' && invoices.length === 0) {
      setInvoicesLoading(true);
      invoicesService.getAll({ customerId: id, limit: 50 })
        .then((r) => { setInvoices(r.data); setInvoicesTotal(r.total); })
        .catch(() => toast.error('Error al cargar facturas'))
        .finally(() => setInvoicesLoading(false));
    }

    if (tab === 'ordenPedidos' && ordenPedidos.length === 0) {
      setOpLoading(true);
      ordenPedidosService.getAll({ customerId: id, limit: 50 })
        .then((r) => { setOrdenPedidos(r.data); setOpTotal(r.total); })
        .catch(() => toast.error('Error al cargar órdenes de pedido'))
        .finally(() => setOpLoading(false));
    }

    if (tab === 'remitos' && remitos.length === 0) {
      setRemitosLoading(true);
      remitosService.getAll({ customerId: id, limit: 50 })
        .then((r) => { setRemitos(r.data); setRemitosTotal(r.total); })
        .catch(() => toast.error('Error al cargar remitos'))
        .finally(() => setRemitosLoading(false));
    }
  }, [tab, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !customer) {
    return (
      <div>
        <PageHeader title="Cliente" backTo="/customers" />
        <div className="animate-pulse space-y-4 max-w-2xl">
          <div className="h-32 bg-gray-100 dark:bg-slate-700 rounded-xl" />
          <div className="h-64 bg-gray-100 dark:bg-slate-700 rounded-xl" />
        </div>
      </div>
    );
  }

  const taxLabel = TAX_CONDITIONS[customer.taxCondition] ?? customer.taxCondition;

  return (
    <div>
      <PageHeader
        title={customer.name}
        backTo="/customers"
        actions={
          canWrite ? (
            <Button variant="secondary" onClick={() => navigate(`/customers/${id}/edit`)}>
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
          ) : undefined
        }
      />

      {/* Customer Info Card */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {customer.taxId && (
          <div>
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">CUIT / CUIL</p>
            <p className="text-sm font-mono font-semibold text-gray-900 dark:text-white">{customer.taxId}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Condición IVA</p>
          <p className="text-sm text-gray-900 dark:text-white">{taxLabel}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Condición de venta</p>
          <p className="text-sm text-gray-900 dark:text-white">
            {customer.saleCondition === 'CUENTA_CORRIENTE' ? 'Cuenta Corriente' : 'Contado'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Estado</p>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${customer.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${customer.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            {customer.isActive ? 'Activo' : 'Inactivo'}
          </span>
        </div>
        {customer.email && (
          <div>
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5 flex items-center gap-1"><Mail className="w-3 h-3" />Email</p>
            <p className="text-sm text-gray-900 dark:text-white truncate">{customer.email}</p>
          </div>
        )}
        {customer.phone && (
          <div>
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5 flex items-center gap-1"><Phone className="w-3 h-3" />Teléfono</p>
            <p className="text-sm text-gray-900 dark:text-white">{customer.phone}</p>
          </div>
        )}
        {(customer.city || customer.address) && (
          <div>
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" />Dirección</p>
            <p className="text-sm text-gray-900 dark:text-white">
              {[customer.address, customer.city, customer.province].filter(Boolean).join(', ')}
            </p>
          </div>
        )}
        {customer.notes && (
          <div className="col-span-2">
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Notas</p>
            <p className="text-sm text-gray-700 dark:text-slate-300">{customer.notes}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-gray-100 dark:border-slate-700">
          {TABS.map((t) => {
            const count = t.id === 'invoices' ? invoicesTotal : t.id === 'ordenPedidos' ? opTotal : remitosTotal;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors duration-150 ${
                  tab === t.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                {count > 0 && (
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                    tab === t.id
                      ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Invoices tab */}
        {tab === 'invoices' && (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50/80 dark:bg-slate-700/50">
                <tr>
                  {['Número', 'Tipo', 'Fecha', 'Vencimiento', 'Total', 'Estado', ''].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {invoicesLoading
                  ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                  : invoices.length === 0
                  ? (
                    <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400 dark:text-slate-500">Sin facturas</td></tr>
                  )
                  : invoices.map((inv) => (
                    <tr key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 cursor-pointer transition-colors duration-100">
                      <td className="px-5 py-3.5"><span className="text-sm font-mono font-medium text-indigo-600 dark:text-indigo-400">{inv.number}</span></td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-slate-400">{INVOICE_TYPES[inv.type as InvoiceType] ?? inv.type}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-slate-400 tabular-nums">{formatDate(inv.date)}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-slate-500 tabular-nums">{inv.dueDate ? formatDate(inv.dueDate) : '—'}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-white tabular-nums text-right">{formatCurrency(Number(inv.total), inv.currency)}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant={INVOICE_STATUS_VARIANT[inv.status] ?? 'default'} dot>
                          {INVOICE_STATUSES[inv.status as InvoiceStatus] ?? inv.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <ArrowRight className="w-4 h-4 text-gray-300 dark:text-slate-600" />
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        )}

        {/* Órdenes de Pedido tab */}
        {tab === 'ordenPedidos' && (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50/80 dark:bg-slate-700/50">
                <tr>
                  {['Número', 'Fecha', 'Vencimiento', 'Total', 'Estado', ''].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {opLoading
                  ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
                  : ordenPedidos.length === 0
                  ? (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400 dark:text-slate-500">Sin órdenes de pedido</td></tr>
                  )
                  : ordenPedidos.map((op) => (
                    <tr key={op.id} onClick={() => navigate(`/orden-pedidos/${op.id}`)} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 cursor-pointer transition-colors duration-100">
                      <td className="px-5 py-3.5"><span className="text-sm font-mono font-medium text-indigo-600 dark:text-indigo-400">{op.number}</span></td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-slate-400 tabular-nums">{formatDate(op.date)}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-slate-500 tabular-nums">{op.dueDate ? formatDate(op.dueDate) : '—'}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{formatCurrency(Number(op.total), op.currency)}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant={(OP_STATUS_VARIANT[op.status] ?? 'default') as any} dot>
                          {ORDEN_PEDIDO_STATUSES[op.status as OrdenPedidoStatus] ?? op.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <ArrowRight className="w-4 h-4 text-gray-300 dark:text-slate-600" />
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        )}

        {/* Remitos tab */}
        {tab === 'remitos' && (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50/80 dark:bg-slate-700/50">
                <tr>
                  {['Número', 'Fecha', 'Vinculado a', 'Estado', ''].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {remitosLoading
                  ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                  : remitos.length === 0
                  ? (
                    <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400 dark:text-slate-500">Sin remitos</td></tr>
                  )
                  : remitos.map((r) => (
                    <tr key={r.id} onClick={() => navigate(`/remitos/${r.id}`)} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 cursor-pointer transition-colors duration-100">
                      <td className="px-5 py-3.5"><span className="text-sm font-mono font-medium text-indigo-600 dark:text-indigo-400">{r.number}</span></td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-slate-400 tabular-nums">{formatDate(r.date)}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-slate-400">
                        {r.invoice
                          ? <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">Factura {r.invoice.number}</span>
                          : r.budget
                          ? <span className="text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full font-medium">Presupuesto {r.budget.number}</span>
                          : <span className="text-gray-400 dark:text-slate-500">—</span>
                        }
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={REMITO_STATUS_VARIANT[r.status] ?? 'default'} dot>
                          {REMITO_STATUSES[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <ArrowRight className="w-4 h-4 text-gray-300 dark:text-slate-600" />
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
