import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Edit, Package, Calendar, Truck, ExternalLink, CreditCard, Percent,
  FileText, Wallet, LayoutDashboard, AlertTriangle, Mail, Phone, MapPin, MessageCircle, Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card } from '../../components/ui';
import { PageHeader, PurchaseInvoiceDetailModal } from '../../components/shared';
import SupplierRetentionsTab from './SupplierRetentionsTab';
import { suppliersService, purchaseInvoicesService, ordenPagosService } from '../../services';
import { formatCurrency, formatCuit } from '../../utils/formatters';
import { TAX_CONDITION_OPTIONS } from '../../utils/constants';
import type { Supplier, SupplierProductStat, SupplierSummary, PurchaseInvoice } from '../../types';
import type { OrdenPago, SupplierAccountMovement } from '../../types/ordenPago.types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ── KPI ──────────────────────────────────────────────────────────
function StatCard({ label, value, hint, tone = 'neutral' }: {
  label: string;
  value: string | number;
  hint?: React.ReactNode;
  tone?: 'neutral' | 'danger';
}) {
  const danger = tone === 'danger';
  return (
    <div className={`rounded-xl p-4 border ${
      danger
        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'
    }`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${danger ? 'text-red-700 dark:text-red-400' : 'text-gray-400 dark:text-slate-500'}`}>
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-bold leading-tight tabular-nums ${danger ? 'text-red-800 dark:text-red-300' : 'text-gray-900 dark:text-white'}`}>
        {value}
      </p>
      {hint && <div className="mt-1.5 text-xs">{hint}</div>}
    </div>
  );
}

// ── Antigüedad de la deuda ───────────────────────────────────────
function AgingCard({ summary, onOpenAccount }: { summary: SupplierSummary; onOpenAccount: () => void }) {
  const { aging } = summary;
  const total = aging.notDue + aging.d1_30 + aging.d31_60 + aging.d60plus;
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  const buckets = [
    { label: 'Por vencer',    value: aging.notDue,  color: 'bg-indigo-500', text: 'text-gray-900 dark:text-white' },
    { label: '1 – 30 días',   value: aging.d1_30,   color: 'bg-amber-500',  text: 'text-amber-700 dark:text-amber-400' },
    { label: '31 – 60 días',  value: aging.d31_60,  color: 'bg-red-600',    text: 'text-red-700 dark:text-red-400' },
    { label: '+60 días',      value: aging.d60plus, color: 'bg-gray-300 dark:bg-slate-600', text: 'text-gray-400 dark:text-slate-500' },
  ];

  return (
    <Card>
      <div className="flex items-baseline justify-between mb-3.5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Deuda por antigüedad</h2>
        <button onClick={onOpenAccount} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700">
          Ver cuenta corriente
        </button>
      </div>

      {total === 0 ? (
        <p className="text-sm text-gray-400 dark:text-slate-500 py-2">Sin facturas pendientes.</p>
      ) : (
        <>
          <div className="flex h-2.5 rounded-full overflow-hidden mb-3.5">
            {buckets.map((b) => (
              b.value > 0 && <span key={b.label} className={b.color} style={{ width: `${pct(b.value)}%` }} />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {buckets.map((b) => (
              <div key={b.label}>
                <p className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-slate-400">
                  <span className={`w-2 h-2 rounded-sm ${b.color}`} />
                  {b.label}
                </p>
                <p className={`mt-1 text-base font-bold tabular-nums ${b.text}`}>{formatCurrency(b.value, 'ARS')}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

const MOVEMENT_BADGE: Record<string, string> = {
  FC:        'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800',
  NC:        'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800',
  ND:        'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  OP:        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
  RETENTION: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
};

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [summary, setSummary] = useState<SupplierSummary | null>(null);
  const [movements, setMovements] = useState<SupplierAccountMovement[]>([]);
  const [products, setProducts] = useState<SupplierProductStat[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [ordenPagos, setOrdenPagos] = useState<OrdenPago[]>([]);
  const [openInvoice, setOpenInvoice] = useState<PurchaseInvoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<'summary' | 'invoices' | 'payments' | 'products' | 'retentions'>('summary');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [s, sum, p] = await Promise.all([
          suppliersService.getById(id),
          suppliersService.getSummary(id).catch(() => null),
          suppliersService.getProducts(id).catch(() => []),
        ]);
        setSupplier(s);
        setSummary(sum);
        setProducts(p);
      } catch {
        toast.error('Error al cargar proveedor');
        navigate('/suppliers');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Últimos movimientos de cuenta corriente (pestaña Resumen).
  useEffect(() => {
    if (!id) return;
    ordenPagosService.getSupplierAccount(id, { page: 1, limit: 6 })
      .then((acc) => setMovements(acc.data))
      .catch(() => setMovements([]));
  }, [id]);

  // Las pestañas cargan bajo demanda.
  useEffect(() => {
    if (!id || tab !== 'invoices' || invoices.length > 0) return;
    purchaseInvoicesService.getAll({ supplierId: id, limit: 15 })
      .then((r) => setInvoices(r.data))
      .catch(() => toast.error('Error al cargar las facturas'));
  }, [id, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id || tab !== 'payments' || ordenPagos.length > 0) return;
    ordenPagosService.getAll({ supplierId: id, limit: 15 })
      .then((r) => setOrdenPagos(r.data))
      .catch(() => toast.error('Error al cargar las órdenes de pago'));
  }, [id, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !supplier) {
    return (
      <div>
        <PageHeader title="Proveedor" backTo="/suppliers" />
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-gray-100 dark:bg-slate-700 rounded-xl" />)}
          </div>
          <div className="h-64 bg-gray-100 dark:bg-slate-700 rounded-xl" />
          <div className="h-64 bg-gray-100 dark:bg-slate-700 rounded-xl" />
        </div>
      </div>
    );
  }

  const taxLabel = TAX_CONDITION_OPTIONS.find((t) => t.value === supplier.taxCondition)?.label ?? supplier.taxCondition;
  const balanceArs = summary?.balance.ARS ?? 0;
  const balanceUsd = summary?.balance.USD ?? 0;
  const lastPurchase = summary?.lastPurchaseDate ?? null;

  const tabs = [
    { key: 'summary',    label: 'Resumen',         icon: LayoutDashboard, count: undefined },
    { key: 'invoices',   label: 'Facturas',        icon: FileText,        count: summary?.pendingCount || undefined },
    { key: 'payments',   label: 'Órdenes de pago', icon: Wallet,          count: undefined },
    { key: 'products',   label: 'Productos',       icon: Package,         count: products.length || undefined },
    { key: 'retentions', label: 'Retenciones',     icon: Percent,         count: undefined },
  ] as const;

  return (
    <div>
      <PageHeader
        title={supplier.name}
        subtitle={[
          supplier.cuit ? formatCuit(supplier.cuit) : null,
          taxLabel,
          supplier.city,
        ].filter(Boolean).join(' · ')}
        backTo="/suppliers"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/supplier-accounts/${id}`)}>
              <CreditCard className="w-4 h-4 mr-2" />
              Cuenta Corriente
            </Button>
            <Button variant="outline" onClick={() => navigate(`/suppliers/${id}/edit`)}>
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
            <Button onClick={() => navigate(`/orden-pagos/new?supplierId=${id}`)}>
              <Plus className="w-4 h-4 mr-2" />
              Nueva orden de pago
            </Button>
          </div>
        }
      />

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Deuda actual"
          value={formatCurrency(Math.abs(balanceArs), 'ARS')}
          tone={summary && summary.overdueAmount > 0 ? 'danger' : 'neutral'}
          hint={
            summary && summary.overdueAmount > 0 ? (
              <span className="font-semibold text-red-600 dark:text-red-400 tabular-nums">
                {formatCurrency(summary.overdueAmount, 'ARS')} vencido · {summary.overdueCount}{' '}
                {summary.overdueCount === 1 ? 'factura' : 'facturas'}
              </span>
            ) : balanceArs < 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">Saldo a favor</span>
            ) : balanceUsd !== 0 ? (
              <span className="text-gray-400 dark:text-slate-500 tabular-nums">+ {formatCurrency(balanceUsd, 'USD')}</span>
            ) : (
              <span className="text-gray-400 dark:text-slate-500">Al día</span>
            )
          }
        />
        <StatCard
          label="Comprado 12 meses"
          value={formatCurrency(summary?.purchased12m ?? 0, 'ARS')}
          hint={<span className="text-gray-400 dark:text-slate-500">Facturas y ND menos NC</span>}
        />
        <StatCard
          label="Facturas pendientes"
          value={summary?.pendingCount ?? 0}
          hint={
            summary?.nextDueDate
              ? <span className="text-gray-500 dark:text-slate-400">Próximo vto. {formatDate(summary.nextDueDate)}</span>
              : <span className="text-gray-400 dark:text-slate-500">Sin vencimientos próximos</span>
          }
        />
        <StatCard
          label="Última compra"
          value={lastPurchase ? formatDate(lastPurchase) : '—'}
          hint={
            lastPurchase
              ? <span className="text-gray-500 dark:text-slate-400">hace {daysAgo(lastPurchase)} días</span>
              : <span className="text-gray-400 dark:text-slate-500">Sin compras registradas</span>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">

        <div className="space-y-4 min-w-0">
          {/* ── Tabs ── */}
          <div className="flex gap-1 border-b border-gray-200 dark:border-slate-700 overflow-x-auto">
            {tabs.map(({ key, label, icon: Icon, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  tab === key
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                {count !== undefined && (
                  <span className="ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Resumen ── */}
          {tab === 'summary' && (
            <div className="space-y-4">
              {summary && <AgingCard summary={summary} onOpenAccount={() => navigate(`/supplier-accounts/${id}`)} />}

              <Card padding="none">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Últimos movimientos</h2>
                  <button
                    onClick={() => navigate(`/supplier-accounts/${id}`)}
                    className="ml-auto text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
                  >
                    Ver todos
                  </button>
                </div>

                {movements.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-gray-400 dark:text-slate-500">
                    Sin movimientos de cuenta corriente.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-slate-700">
                          {['Fecha', 'Comprobante', 'Detalle', 'Debe', 'Haber', 'Saldo'].map((h, i) => (
                            <th
                              key={h}
                              className={`px-4 py-2.5 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap ${i >= 3 ? 'text-right' : 'text-left'}`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                        {movements.map((m) => (
                          <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors duration-100">
                            <td className="px-4 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap">
                              {formatDate(m.docDate ?? m.createdAt)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {m.kind && (
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border mr-1.5 ${MOVEMENT_BADGE[m.kind] ?? MOVEMENT_BADGE.RETENTION}`}>
                                  {m.kind}
                                </span>
                              )}
                              <span className="font-mono text-xs text-gray-600 dark:text-slate-300">{m.docNumber ?? '—'}</span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 dark:text-slate-400 max-w-xs truncate">{m.description ?? '—'}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-800 dark:text-slate-200">
                              {m.type === 'DEBIT' ? formatCurrency(m.amount, m.currency as 'ARS') : <span className="text-gray-300 dark:text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                              {m.type === 'CREDIT' ? formatCurrency(m.amount, m.currency as 'ARS') : <span className="text-gray-300 dark:text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900 dark:text-white">
                              {formatCurrency(m.balance, m.currency as 'ARS')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ── Facturas ── */}
          {tab === 'invoices' && (
            <Card padding="none">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Facturas de compra</h2>
                <button
                  onClick={() => navigate('/purchase-invoices')}
                  className="ml-auto text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
                >
                  Ver todas
                </button>
              </div>
              {invoices.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-gray-400 dark:text-slate-500">Sin facturas registradas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-slate-700">
                        {['Comprobante', 'Fecha', 'Vencimiento', 'Importe', 'Estado'].map((h, i) => (
                          <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap ${i === 3 ? 'text-right' : 'text-left'}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                      {invoices.map((inv) => {
                        const overdue = inv.status !== 'PAID' && inv.dueDate && new Date(inv.dueDate) < new Date();
                        return (
                          <tr
                            key={inv.id}
                            onClick={() => {
                              // El listado no trae ítems ni tributos: el detalle se pide completo.
                              purchaseInvoicesService.getById(inv.id)
                                .then(setOpenInvoice)
                                .catch(() => toast.error('Error al abrir la factura'));
                            }}
                            className="hover:bg-gray-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors duration-100"
                          >
                            <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-slate-300">{inv.number}</td>
                            <td className="px-4 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatDate(inv.date)}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {inv.dueDate
                                ? <span className={overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-slate-400'}>{formatDate(inv.dueDate)}</span>
                                : <span className="text-gray-300 dark:text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-800 dark:text-slate-200">
                              {formatCurrency(inv.amount, inv.currency as 'ARS')}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                                inv.status === 'PAID'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                                  : overdue
                                  ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                              }`}>
                                {inv.status === 'PAID' ? 'Pagada' : overdue ? 'Vencida' : inv.status === 'PARTIALLY_PAID' ? 'Pago parcial' : 'Pendiente'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* ── Órdenes de pago ── */}
          {tab === 'payments' && (
            <Card padding="none">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Órdenes de pago</h2>
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => navigate(`/orden-pagos/new?supplierId=${id}`)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Nueva
                </Button>
              </div>
              {ordenPagos.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-gray-400 dark:text-slate-500">Sin órdenes de pago para este proveedor.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-slate-700">
                        {['Orden', 'Fecha', 'Medio', 'Importe', 'Estado'].map((h, i) => (
                          <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap ${i === 3 ? 'text-right' : 'text-left'}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                      {ordenPagos.map((op) => (
                        <tr
                          key={op.id}
                          onClick={() => navigate(`/orden-pagos/${op.id}`)}
                          className="hover:bg-gray-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors duration-100"
                        >
                          <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-slate-300">{op.number}</td>
                          <td className="px-4 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatDate(op.date)}</td>
                          <td className="px-4 py-3 text-gray-500 dark:text-slate-400">{op.paymentMethod}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-800 dark:text-slate-200">
                            {formatCurrency(op.amount, op.currency)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                              op.status === 'PAID'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                                : op.status === 'CANCELLED'
                                ? 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600'
                                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                            }`}>
                              {op.status === 'PAID' ? 'Pagada' : op.status === 'CANCELLED' ? 'Anulada' : 'Pendiente'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* ── Productos ── */}
          {tab === 'products' && (
            <Card padding="none">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Productos provistos</h2>
                {products.length > 0 && (
                  <span className="ml-auto text-xs text-gray-400 dark:text-slate-500">{products.length} productos</span>
                )}
              </div>

              {products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-3">
                    <Package className="w-6 h-6 text-gray-300 dark:text-slate-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Sin productos registrados</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500 max-w-xs">
                    Los productos aparecen aquí cuando se registran compras a este proveedor con productos vinculados.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-slate-700">
                        {['Producto', 'Último precio', 'Precio actual', 'Cant. comprada', 'Compras', 'Última compra', ''].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                      {products.map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => navigate(`/products/${p.id}/edit`)}
                          className="hover:bg-gray-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors duration-100 group"
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900 dark:text-white leading-tight">{p.name}</p>
                            <p className="text-xs text-gray-400 dark:text-slate-500 font-mono mt-0.5">{p.sku}</p>
                          </td>
                          <td className="px-4 py-3 tabular-nums font-medium text-gray-800 dark:text-slate-200">
                            {formatCurrency(p.lastUnitPrice, 'ARS')}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-slate-300">
                            {formatCurrency(p.price, 'ARS')}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-slate-300">
                            {Number.isInteger(p.totalQuantity) ? p.totalQuantity : p.totalQuantity.toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                              {p.purchaseCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap">
                            {formatDate(p.lastPurchaseDate)}
                          </td>
                          <td className="px-4 py-3">
                            <ExternalLink className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors duration-150" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {tab === 'retentions' && <SupplierRetentionsTab supplierId={id!} />}
        </div>

        {/* ── Panel lateral ── */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
                <Truck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{supplier.name}</p>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${supplier.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${supplier.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  {supplier.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>

            {/* Acciones rápidas de contacto */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { href: supplier.email ? `mailto:${supplier.email}` : null, icon: Mail, label: 'Email' },
                { href: supplier.phone ? `tel:${supplier.phone.replace(/\s+/g, '')}` : null, icon: Phone, label: 'Llamar' },
                { href: supplier.phone ? `https://wa.me/${supplier.phone.replace(/\D/g, '')}` : null, icon: MessageCircle, label: 'WhatsApp' },
                {
                  href: supplier.address || supplier.city
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([supplier.address, supplier.city].filter(Boolean).join(', '))}`
                    : null,
                  icon: MapPin, label: 'Mapa',
                },
              ].map(({ href, icon: Icon, label }) => (
                href ? (
                  <a
                    key={label}
                    href={href}
                    target={href.startsWith('http') ? '_blank' : undefined}
                    rel="noreferrer"
                    className="flex flex-col items-center gap-1 py-2 rounded-lg border border-gray-200 dark:border-slate-600 text-[11px] text-gray-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-indigo-500" />
                    {label}
                  </a>
                ) : (
                  <span
                    key={label}
                    className="flex flex-col items-center gap-1 py-2 rounded-lg border border-dashed border-gray-200 dark:border-slate-700 text-[11px] text-gray-300 dark:text-slate-600"
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </span>
                )
              ))}
            </div>

            <dl className="space-y-3 text-sm">
              {supplier.cuit && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-400 dark:text-slate-500">CUIT</dt>
                  <dd className="font-mono text-gray-700 dark:text-slate-300">{formatCuit(supplier.cuit)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-gray-400 dark:text-slate-500">Condición IVA</dt>
                <dd className="text-gray-700 dark:text-slate-300 text-right">{taxLabel}</dd>
              </div>
              {supplier.phone && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-400 dark:text-slate-500">Teléfono</dt>
                  <dd className="text-gray-700 dark:text-slate-300">{supplier.phone}</dd>
                </div>
              )}
              {supplier.email && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-400 dark:text-slate-500">Email</dt>
                  <dd className="text-gray-700 dark:text-slate-300 truncate max-w-[170px]" title={supplier.email}>{supplier.email}</dd>
                </div>
              )}
              {supplier.address && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-400 dark:text-slate-500">Dirección</dt>
                  <dd className="text-gray-700 dark:text-slate-300 text-right max-w-[170px]">{supplier.address}</dd>
                </div>
              )}
              {supplier.city && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-400 dark:text-slate-500">Ciudad</dt>
                  <dd className="text-gray-700 dark:text-slate-300">{supplier.city}</dd>
                </div>
              )}
              {supplier.retentionType && (
                <div className="flex justify-between gap-3 items-center">
                  <dt className="text-gray-400 dark:text-slate-500">Retención</dt>
                  <dd>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-600">
                      {supplier.retentionType} {supplier.retentionPercentage ?? 0}%
                    </span>
                  </dd>
                </div>
              )}
            </dl>

            {supplier.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                <p className="text-xs text-gray-400 dark:text-slate-500 mb-1">Notas</p>
                <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">{supplier.notes}</p>
              </div>
            )}
          </Card>

          {summary && summary.overdueCount > 0 && (
            <Card className="border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/20">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                    {summary.overdueCount} {summary.overdueCount === 1 ? 'factura vencida' : 'facturas vencidas'}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-400 tabular-nums mt-0.5">
                    {formatCurrency(summary.overdueAmount, 'ARS')} impagos
                  </p>
                  <Button size="sm" className="mt-3" onClick={() => navigate(`/orden-pagos/new?supplierId=${id}`)}>
                    Generar orden de pago
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {lastPurchase && daysAgo(lastPurchase) > 180 && (
            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/20">
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Sin compras hace {daysAgo(lastPurchase)} días. Revisá si sigue siendo un proveedor activo.
                </p>
              </div>
            </Card>
          )}
        </div>

      </div>

      {openInvoice && (
        <PurchaseInvoiceDetailModal invoice={openInvoice} onClose={() => setOpenInvoice(null)} />
      )}
    </div>
  );
}
