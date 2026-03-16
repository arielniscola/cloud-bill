import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Receipt, Search, CreditCard, Banknote } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card } from '../../components/ui';
import { PageHeader, CustomerSearchSelect } from '../../components/shared';
import Pagination from '../../components/shared/Pagination';
import { invoicesService, customersService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  INVOICE_TYPES,
  INVOICE_STATUSES,
  INVOICE_STATUS_OPTIONS,
  INVOICE_TYPE_OPTIONS,
  DELIVERY_STATUSES,
  DEFAULT_PAGE_SIZE,
} from '../../utils/constants';
import type { Invoice, InvoiceStatus, InvoiceType, Customer } from '../../types';

// ── Type chip config ─────────────────────────────────────────────
const TYPE_CHIP: Record<string, { label: string; cls: string }> = {
  FACTURA_A:      { label: 'FA',   cls: 'text-indigo-700 bg-indigo-50 ring-indigo-200/60 dark:text-indigo-300 dark:bg-indigo-900/30 dark:ring-indigo-700/60' },
  FACTURA_B:      { label: 'FB',   cls: 'text-sky-700 bg-sky-50 ring-sky-200/60 dark:text-sky-300 dark:bg-sky-900/30 dark:ring-sky-700/60' },
  FACTURA_C:      { label: 'FC',   cls: 'text-teal-700 bg-teal-50 ring-teal-200/60 dark:text-teal-300 dark:bg-teal-900/30 dark:ring-teal-700/60' },
  NOTA_CREDITO_A: { label: 'NC-A', cls: 'text-emerald-700 bg-emerald-50 ring-emerald-200/60 dark:text-emerald-300 dark:bg-emerald-900/30 dark:ring-emerald-700/60' },
  NOTA_CREDITO_B: { label: 'NC-B', cls: 'text-emerald-700 bg-emerald-50 ring-emerald-200/60 dark:text-emerald-300 dark:bg-emerald-900/30 dark:ring-emerald-700/60' },
  NOTA_CREDITO_C: { label: 'NC-C', cls: 'text-emerald-700 bg-emerald-50 ring-emerald-200/60 dark:text-emerald-300 dark:bg-emerald-900/30 dark:ring-emerald-700/60' },
  NOTA_DEBITO_A:  { label: 'ND-A', cls: 'text-amber-700 bg-amber-50 ring-amber-200/60 dark:text-amber-300 dark:bg-amber-900/30 dark:ring-amber-700/60' },
  NOTA_DEBITO_B:  { label: 'ND-B', cls: 'text-amber-700 bg-amber-50 ring-amber-200/60 dark:text-amber-300 dark:bg-amber-900/30 dark:ring-amber-700/60' },
  NOTA_DEBITO_C:  { label: 'ND-C', cls: 'text-amber-700 bg-amber-50 ring-amber-200/60 dark:text-amber-300 dark:bg-amber-900/30 dark:ring-amber-700/60' },
};

// ── Status badge ─────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; cls: string; dot: string }> = {
  DRAFT:          { label: 'Borrador',       cls: 'text-gray-600 bg-gray-100 border-gray-200 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600',              dot: 'bg-gray-400' },
  ISSUED:         { label: 'Emitida',        cls: 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-900/30 dark:border-blue-800',               dot: 'bg-blue-500' },
  PAID:           { label: 'Pagada',         cls: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-800', dot: 'bg-emerald-500' },
  PARTIALLY_PAID: { label: 'Pago parcial',  cls: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/30 dark:border-amber-800',          dot: 'bg-amber-500' },
  CANCELLED:      { label: 'Cancelada',      cls: 'text-red-600 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/30 dark:border-red-800',                      dot: 'bg-red-500' },
};

const DELIVERY_CFG: Record<string, { label: string; cls: string }> = {
  NOT_DELIVERED:       { label: 'Sin entregar',   cls: 'text-gray-500 bg-gray-50 border-gray-200 dark:text-slate-400 dark:bg-slate-700/50 dark:border-slate-600' },
  PARTIALLY_DELIVERED: { label: 'Parcial',        cls: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/30 dark:border-amber-800' },
  DELIVERED:           { label: 'Entregado',      cls: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-800' },
};

// ── Avatar helper ─────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
];
function avatarCls(name: string) {
  const h = name.split('').reduce((a, c) => c.charCodeAt(0) + a, 0);
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ── Compact date input ───────────────────────────────────────────
function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-[34px] px-2.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
    />
  );
}

// ── Skeleton ─────────────────────────────────────────────────────
function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="animate-pulse border-b border-gray-100 dark:border-slate-700">
          <td className="px-4 py-4"><div className="h-3.5 bg-gray-100 dark:bg-slate-700 rounded w-20" /></td>
          <td className="px-4 py-4"><div className="h-5 bg-gray-100 dark:bg-slate-700 rounded-full w-10 mx-auto" /></td>
          <td className="px-4 py-4"><div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-28" /></td>
          <td className="px-4 py-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-slate-700 shrink-0" />
              <div className="h-3.5 bg-gray-100 dark:bg-slate-700 rounded w-32" />
            </div>
          </td>
          <td className="px-4 py-4"><div className="h-5 bg-gray-100 dark:bg-slate-700 rounded-full w-8 mx-auto" /></td>
          <td className="px-4 py-4"><div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-24 ml-auto" /></td>
          <td className="px-4 py-4"><div className="h-5 bg-gray-100 dark:bg-slate-700 rounded-full w-14 mx-auto" /></td>
          <td className="px-4 py-4"><div className="h-5 bg-gray-100 dark:bg-slate-700 rounded-full w-20 mx-auto" /></td>
          <td className="px-4 py-4"><div className="h-5 bg-gray-100 dark:bg-slate-700 rounded-full w-14 mx-auto" /></td>
        </tr>
      ))}
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function InvoicesPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [saleConditionFilter, setSaleConditionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    customersService.getAll({ limit: 1000 }).then((r) => setCustomers(r.data)).catch(() => {});
  }, []);

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await invoicesService.getAll({
        page, limit,
        status: (statusFilter || undefined) as InvoiceStatus | undefined,
        type: (typeFilter || undefined) as InvoiceType | undefined,
        customerId: customerFilter || undefined,
        saleCondition: (saleConditionFilter || undefined) as 'CONTADO' | 'CUENTA_CORRIENTE' | undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setInvoices(response.data);
      setTotal(response.total);
    } catch {
      toast.error('Error al cargar facturas');
    } finally {
      setIsLoading(false);
      setIsFirstLoad(false);
    }
  }, [page, limit, statusFilter, typeFilter, customerFilter, saleConditionFilter, dateFrom, dateTo]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const hasFilters = !!(statusFilter || typeFilter || customerFilter || saleConditionFilter || dateFrom || dateTo);
  const clearFilters = () => {
    setStatusFilter(''); setTypeFilter(''); setCustomerFilter('');
    setSaleConditionFilter(''); setDateFrom(''); setDateTo(''); setPage(1);
  };

  // Page stats
  const pageStats = useMemo(() => {
    const total = invoices.reduce((s, inv) => s + Number(inv.total), 0);
    const tax   = invoices.reduce((s, inv) => s + Number(inv.taxAmount), 0);
    const paid  = invoices.filter((inv) => inv.status === 'PAID').length;
    const pending = invoices.filter((inv) => ['ISSUED', 'PARTIALLY_PAID'].includes(inv.status)).length;
    return { total, tax, paid, pending };
  }, [invoices]);

  const showSkeleton = isFirstLoad && isLoading;
  const showEmpty = !isLoading && !isFirstLoad && invoices.length === 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Facturas"
        subtitle={`${total} ${total === 1 ? 'factura' : 'facturas'}${hasFilters ? ' · filtros activos' : ''}`}
        actions={
          <Button onClick={() => navigate('/invoices/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva factura
          </Button>
        }
      />

      {/* ── Stats strip ── */}
      {!isFirstLoad && invoices.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
            <div className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{total}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Facturas{hasFilters ? ' (filtradas)' : ''}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
            <div className="text-lg font-bold text-gray-900 dark:text-white leading-none truncate">
              {formatCurrency(pageStats.total, 'ARS')}
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Total · IVA {formatCurrency(pageStats.tax, 'ARS')}
            </div>
          </div>
          <button
            onClick={() => setStatusFilter((f) => (f === 'PAID' ? '' : 'PAID'))}
            className={`text-left rounded-xl px-4 py-3.5 border transition-all duration-150 active:scale-[0.98] ${
              statusFilter === 'PAID'
                ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 ring-1 ring-emerald-300'
                : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-emerald-200 hover:bg-emerald-50/30'
            }`}
          >
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 leading-none">{pageStats.paid}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Pagadas</div>
          </button>
          <button
            onClick={() => setStatusFilter((f) => (f === 'ISSUED' ? '' : 'ISSUED'))}
            className={`text-left rounded-xl px-4 py-3.5 border transition-all duration-150 active:scale-[0.98] ${
              statusFilter === 'ISSUED'
                ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 ring-1 ring-amber-300'
                : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-amber-200 hover:bg-amber-50/30'
            }`}
          >
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 leading-none">{pageStats.pending}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Pendientes de cobro</div>
          </button>
        </div>
      )}

      <Card padding="none">
        {/* ── Filters ── */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 space-y-2.5">
          {/* Row 1 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Tipo */}
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="h-[34px] px-2.5 pr-7 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all appearance-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
            >
              <option value="">Todos los tipos</option>
              {INVOICE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Estado */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-[34px] px-2.5 pr-7 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all appearance-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
            >
              <option value="">Todos los estados</option>
              {INVOICE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Condición de venta */}
            <select
              value={saleConditionFilter}
              onChange={(e) => { setSaleConditionFilter(e.target.value); setPage(1); }}
              className={`h-[34px] px-2.5 pr-7 text-xs rounded-lg border transition-all appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 ${
                saleConditionFilter
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                  : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-200'
              }`}
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
            >
              <option value="">Condición de venta</option>
              <option value="CONTADO">Contado</option>
              <option value="CUENTA_CORRIENTE">Cuenta corriente</option>
            </select>

            {/* Cliente */}
            <div className="w-52">
              <CustomerSearchSelect
                customers={customers}
                value={customerFilter}
                onChange={(v) => { setCustomerFilter(v); setPage(1); }}
                clearLabel="Todos los clientes"
              />
            </div>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Limpiar
              </button>
            )}
          </div>

          {/* Row 2: date range */}
          <div className="flex flex-wrap items-center gap-2">
            <Search className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
            <span className="text-xs text-gray-400 dark:text-slate-500">Período:</span>
            <DateInput value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1); }} />
            <span className="text-gray-300 dark:text-slate-600 text-xs select-none">→</span>
            <DateInput value={dateTo} onChange={(v) => { setDateTo(v); setPage(1); }} />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
                className="text-xs text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 flex items-center gap-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* ── Skeleton ── */}
        {showSkeleton && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/80 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                <tr>
                  {['Fecha', 'Tipo', 'Número', 'Cliente', 'Ítems', 'Total', 'Condición', 'Estado', 'Entrega'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800"><SkeletonRows count={8} /></tbody>
            </table>
          </div>
        )}

        {/* ── Empty ── */}
        {showEmpty && (
          <div className="py-20 flex flex-col items-center text-center px-4">
            <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-4">
              <Receipt className="w-5 h-5 text-gray-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-1">
              {hasFilters ? 'Sin resultados' : 'Sin facturas todavía'}
            </p>
            <p className="text-sm text-gray-400 dark:text-slate-500 mb-5 max-w-xs">
              {hasFilters ? 'Probá ajustando los filtros.' : 'Creá tu primera factura para comenzar a registrar ventas.'}
            </p>
            {hasFilters
              ? <button onClick={clearFilters} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Limpiar filtros</button>
              : <Button onClick={() => navigate('/invoices/new')}><Plus className="w-4 h-4 mr-2" />Nueva factura</Button>
            }
          </div>
        )}

        {/* ── Table ── */}
        {!showSkeleton && !showEmpty && (
          <div className={`transition-opacity duration-200 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: '760px' }}>
                <thead className="bg-gray-50/80 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Fecha</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Tipo</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Número</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider w-full">Cliente</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Ítems</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Total</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Condición</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Estado</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Entrega</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700">
                  {invoices.map((inv) => {
                    const chip = TYPE_CHIP[inv.type];
                    const statusCfg = STATUS_CFG[inv.status];
                    const isCancelled = inv.status === 'CANCELLED';
                    const customerName = inv.customer?.name ?? '';
                    const itemCount = (inv as any)._count?.items ?? inv.items?.length ?? 0;
                    const isCC = inv.saleCondition === 'CUENTA_CORRIENTE';

                    return (
                      <tr
                        key={inv.id}
                        className={`cursor-pointer group transition-colors duration-100 ${
                          isCancelled
                            ? 'opacity-60 hover:bg-gray-50/60 dark:hover:bg-slate-700/40'
                            : 'hover:bg-indigo-50/30 dark:hover:bg-slate-700/50'
                        }`}
                        onClick={() => navigate(`/invoices/${inv.id}`)}
                      >
                        {/* Fecha */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <p className="text-sm font-medium text-gray-800 dark:text-slate-200 leading-none tabular-nums">
                            {formatDate(inv.date)}
                          </p>
                          {inv.dueDate && (
                            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 tabular-nums">
                              vto. {formatDate(inv.dueDate)}
                            </p>
                          )}
                        </td>

                        {/* Tipo */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          <span
                            title={INVOICE_TYPES[inv.type]}
                            className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ring-1 ring-inset leading-none ${chip?.cls ?? 'text-gray-600 bg-gray-50 ring-gray-200/60'}`}
                          >
                            {chip?.label ?? inv.type}
                          </span>
                        </td>

                        {/* Número */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="font-mono text-xs text-gray-600 dark:text-slate-400">{inv.number}</span>
                        </td>

                        {/* Cliente */}
                        <td className="px-4 py-3.5">
                          {customerName ? (
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${avatarCls(customerName)}`}>
                                {customerName.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm text-gray-700 dark:text-slate-300 truncate">{customerName}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400 dark:text-slate-500 italic text-xs">Consumidor final</span>
                          )}
                        </td>

                        {/* Ítems count */}
                        <td className="px-4 py-3.5 text-center">
                          {itemCount > 0 ? (
                            <span className="inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded-full border text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-900/30 dark:border-indigo-800 leading-none">
                              {itemCount}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-slate-600">—</span>
                          )}
                        </td>

                        {/* Total */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                            {formatCurrency(Number(inv.total), inv.currency)}
                          </span>
                          {inv.currency !== 'ARS' && (
                            <span className="ml-1 text-[10px] font-semibold px-1 py-0.5 rounded-full border text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/20 dark:border-amber-800">
                              {inv.currency}
                            </span>
                          )}
                        </td>

                        {/* Condición de venta */}
                        <td className="px-4 py-3.5 text-center">
                          {isCC ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full border text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-900/30 dark:border-blue-800 leading-none">
                              <CreditCard className="w-3 h-3" />
                              CC
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full border text-gray-500 bg-gray-50 border-gray-200 dark:text-slate-400 dark:bg-slate-700 dark:border-slate-600 leading-none">
                              <Banknote className="w-3 h-3" />
                              Contado
                            </span>
                          )}
                        </td>

                        {/* Estado */}
                        <td className="px-4 py-3.5 text-center">
                          {statusCfg && (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border leading-none ${statusCfg.cls}`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusCfg.dot}`} />
                              {statusCfg.label}
                            </span>
                          )}
                        </td>

                        {/* Entrega */}
                        <td className="px-4 py-3.5 text-center">
                          {inv.deliveryStatus && inv.deliveryStatus !== 'NOT_DELIVERED' ? (
                            <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border leading-none ${DELIVERY_CFG[inv.deliveryStatus]?.cls ?? ''}`}>
                              {DELIVERY_CFG[inv.deliveryStatus]?.label ?? DELIVERY_STATUSES[inv.deliveryStatus]}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-slate-600 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {total > limit && (
              <Pagination
                page={page}
                totalPages={Math.ceil(total / limit)}
                limit={limit}
                total={total}
                onPageChange={setPage}
                onLimitChange={(l) => { setLimit(l); setPage(1); }}
              />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
