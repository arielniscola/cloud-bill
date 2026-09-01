import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUrlFilters } from '../../hooks/useUrlFilters';
import { Plus, X, Receipt, Search, Check, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card } from '../../components/ui';
import { PageHeader, CustomerSearchSelect } from '../../components/shared';
import FiscalModeBadge from '../../components/shared/FiscalModeBadge';
import Pagination from '../../components/shared/Pagination';
import { invoicesService, customersService } from '../../services';
import { useFiscalModeStore } from '../../stores/fiscalMode.store';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../../utils/formatters';
import {
  INVOICE_TYPES,
  INVOICE_STATUS_OPTIONS,
  INVOICE_TYPE_OPTIONS,
  DELIVERY_STATUSES,
  DEFAULT_PAGE_SIZE,
} from '../../utils/constants';
import type { Invoice, InvoiceStatus, InvoiceType, Customer, InvoiceStats, InvoiceCurrencyStats } from '../../types';

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
  AUTHORIZED:     { label: 'Autorizada',     cls: 'text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-900/30 dark:border-violet-800',  dot: 'bg-violet-500' },
  PAID:           { label: 'Pagada',         cls: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-800', dot: 'bg-emerald-500' },
  PARTIALLY_PAID: { label: 'Pago parcial',  cls: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/30 dark:border-amber-800',          dot: 'bg-amber-500' },
  CANCELLED:      { label: 'Cancelada',      cls: 'text-red-600 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/30 dark:border-red-800',                      dot: 'bg-red-500' },
};

const DELIVERY_CFG: Record<string, { label: string; cls: string }> = {
  NOT_DELIVERED:       { label: 'Sin entregar',   cls: 'text-gray-500 bg-gray-50 border-gray-200 dark:text-slate-400 dark:bg-slate-700/50 dark:border-slate-600' },
  PARTIALLY_DELIVERED: { label: 'Parcial',        cls: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/30 dark:border-amber-800' },
  DELIVERED:           { label: 'Entregado',      cls: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-800' },
};

// ── Saldo y vencimiento ──────────────────────────────────────────
/** Estados en los que una factura todavía puede deber plata. */
const OPEN_STATUSES = ['ISSUED', 'AUTHORIZED', 'PARTIALLY_PAID'];

/**
 * Saldo = total − cobrado. `paidAmount` lo calcula el backend sumando los
 * recibos EMITTED de cada comprobante del listado.
 */
function invoiceOutstanding(inv: Invoice): number {
  if (!OPEN_STATUSES.includes(inv.status)) return 0;
  if (!inv.type.startsWith('FACTURA_')) return 0;
  const outstanding = Number(inv.total) - Number((inv as any).paidAmount ?? 0);
  // Un redondeo puede dejar centavos: por debajo de $1 se considera saldada.
  return outstanding < 1 ? 0 : outstanding;
}

/** Días de atraso, o null si no está vencida (o ya no debe nada). */
function invoiceOverdueDays(inv: Invoice): number | null {
  if (!inv.dueDate || invoiceOutstanding(inv) <= 0) return null;
  const due = new Date(inv.dueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
  return days > 0 ? days : null;
}

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
/**
 * Un importe por moneda, apilados. Los tramos NO se suman entre sí: la cuenta
 * corriente del cliente es por moneda y una factura en USD lleva su propia
 * cotización, así que un único número rotulado "ARS" mezclaba dos escalas.
 * Con una sola moneda —el caso normal— se ve exactamente como un importe suelto.
 */
function MoneyByCurrency({
  tramos,
  pick,
  className,
}: {
  tramos: InvoiceCurrencyStats[];
  pick: (t: InvoiceCurrencyStats) => number;
  className: string;
}) {
  const conImporte = tramos.filter((t) => pick(t) !== 0);
  // Sin nada que mostrar igual se ocupa el lugar: un cero en la moneda
  // principal del filtro lee mejor que un hueco.
  const visibles = conImporte.length > 0 ? conImporte : tramos.slice(0, 1);

  if (visibles.length === 0) {
    return <div className={`${className} leading-none truncate tabular-nums`}>{formatCurrency(0, 'ARS')}</div>;
  }

  return (
    <div className="space-y-0.5">
      {visibles.map((t) => (
        <div key={t.currency} className={`${className} leading-none truncate tabular-nums`}>
          {formatCurrency(pick(t), t.currency)}
        </div>
      ))}
    </div>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="animate-pulse border-b border-gray-100 dark:border-slate-700">
          <td className="px-4 py-4"><div className="h-3.5 bg-gray-100 dark:bg-slate-700 rounded w-20" /></td>
          <td className="px-4 py-4"><div className="h-3.5 bg-gray-100 dark:bg-slate-700 rounded w-36" /></td>
          <td className="px-4 py-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-slate-700 shrink-0" />
              <div className="h-3.5 bg-gray-100 dark:bg-slate-700 rounded w-32" />
            </div>
          </td>
          <td className="px-4 py-4"><div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-24 ml-auto" /></td>
          <td className="px-4 py-4"><div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-20 ml-auto" /></td>
          <td className="px-4 py-4"><div className="h-5 bg-gray-100 dark:bg-slate-700 rounded-full w-20" /></td>
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

  // Filtros en la URL, no en useState: al volver del detalle de una factura el
  // listado tiene que estar como lo dejaste.
  const { values, setValues, reset } = useUrlFilters({
    search: '',
    status: '',
    type: '',
    customer: '',
    saleCondition: '',
    dateFrom: '',
    dateTo: '',
    page: '1',
    limit: String(DEFAULT_PAGE_SIZE),
  });

  const { search, dateFrom, dateTo } = values;
  const statusFilter = values.status;
  const typeFilter = values.type;
  const customerFilter = values.customer;
  const saleConditionFilter = values.saleCondition;
  const page = Number(values.page) || 1;
  const limit = Number(values.limit) || DEFAULT_PAGE_SIZE;

  // Cambiar cualquier filtro vuelve a la página 1; moverse de página, no.
  const setSearch = (v: string) => setValues({ search: v, page: '1' });
  const setStatusFilter = (v: string) => setValues({ status: v, page: '1' });
  const setTypeFilter = (v: string) => setValues({ type: v, page: '1' });
  const setCustomerFilter = (v: string) => setValues({ customer: v, page: '1' });
  const setSaleConditionFilter = (v: string) => setValues({ saleCondition: v, page: '1' });
  const setDateFrom = (v: string) => setValues({ dateFrom: v, page: '1' });
  const setDateTo = (v: string) => setValues({ dateTo: v, page: '1' });
  const setPage = (p: number) => setValues({ page: String(p) });
  const setLimit = (l: number) => setValues({ limit: String(l), page: '1' });

  const [total, setTotal] = useState(0);
  const fiscalMode = useFiscalModeStore((s) => s.viewMode);

  useEffect(() => {
    // Lista inicial del desplegable; el resto lo resuelve la búsqueda remota.
    customersService.getAll({ limit: 50 }).then((r) => setCustomers(r.data)).catch(() => {});
  }, []);

  // El texto tipeado se debounce antes de pegarle al backend. Arranca con lo
  // que venga en la URL, así el primer fetch ya sale filtrado.
  const [debouncedSearch, setDebouncedSearch] = useState(() => values.search.trim());
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = useMemo(() => ({
    status: (statusFilter || undefined) as InvoiceStatus | undefined,
    type: (typeFilter || undefined) as InvoiceType | undefined,
    customerId: customerFilter || undefined,
    saleCondition: (saleConditionFilter || undefined) as 'CONTADO' | 'CUENTA_CORRIENTE' | undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: debouncedSearch || undefined,
  }), [statusFilter, typeFilter, customerFilter, saleConditionFilter, dateFrom, dateTo, debouncedSearch]);

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await invoicesService.getAll({ page, limit, ...filters });
      setInvoices(response.data);
      setTotal(response.total);
    } catch {
      toast.error('Error al cargar facturas');
    } finally {
      setIsLoading(false);
      setIsFirstLoad(false);
    }
  }, [page, limit, filters, fiscalMode]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // Los totales salen del conjunto filtrado completo, no de la página: sumar
  // las 25 filas visibles y rotularlo "Total" era el número que engañaba.
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    invoicesService.getStats(filters)
      .then((data) => { if (!cancelled) setStats(data); })
      .catch(() => { if (!cancelled) setStats(null); });
    return () => { cancelled = true; };
  }, [filters, fiscalMode]);

  // Los CONTEOS sí se suman entre monedas: son comprobantes, no importes.
  const pendingCount = stats?.byCurrency.reduce((acc, t) => acc + t.pendingCount, 0) ?? 0;
  const overdueCount = stats?.byCurrency.reduce((acc, t) => acc + t.overdueCount, 0) ?? 0;

  const hasFilters = !!(statusFilter || typeFilter || customerFilter || saleConditionFilter || dateFrom || dateTo || debouncedSearch);
  const clearFilters = () => reset(['limit']);

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

      {/* ── Stats strip — todo el filtro, nunca la página ── */}
      {/* Los importes van por moneda y no se suman: la cuenta corriente del
          cliente es por moneda, así que pesos y dólares no son la misma escala.
          Con una sola moneda (el caso normal) se ve igual que siempre. */}
      {!isFirstLoad && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
            <div className="text-2xl font-bold text-gray-900 dark:text-white leading-none tabular-nums">{stats.count}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Comprobantes{hasFilters ? ' (filtrados)' : ''}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
            <MoneyByCurrency
              tramos={stats.byCurrency}
              pick={(t) => t.total}
              className="text-lg font-bold text-gray-900 dark:text-white"
            />
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1 truncate">
              Facturado · IVA{' '}
              {stats.byCurrency.length === 0
                ? formatCurrency(0, 'ARS')
                : stats.byCurrency.map((t) => formatCurrency(t.taxAmount, t.currency)).join(' · ')}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3.5 shadow-[inset_3px_0_0_theme(colors.amber.500)]">
            <MoneyByCurrency
              tramos={stats.byCurrency}
              pick={(t) => t.pendingAmount}
              className="text-lg font-bold text-amber-600 dark:text-amber-400"
            />
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Saldo pendiente · {pendingCount} {pendingCount === 1 ? 'factura' : 'facturas'}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3.5 shadow-[inset_3px_0_0_theme(colors.red.500)]">
            <MoneyByCurrency
              tramos={stats.byCurrency}
              pick={(t) => t.overdueAmount}
              className="text-lg font-bold text-red-600 dark:text-red-400"
            />
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Vencido · {overdueCount} {overdueCount === 1 ? 'factura' : 'facturas'}
            </div>
          </div>
        </div>
      )}

      <Card padding="none">
        {/* ── Filters ── */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 space-y-2.5">
          {/* Row 1 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Búsqueda libre — número de comprobante, cliente o CUIT */}
            <div className="relative min-w-[240px] flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Número, cliente o CUIT…"
                className="w-full h-[34px] pl-9 pr-8 text-xs rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

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
                serverSearch
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
                  {['Fecha', 'Comprobante', 'Cliente', 'Total', 'Saldo', 'Estado'].map((h) => (
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
              <table className="w-full text-sm" style={{ minWidth: '820px' }}>
                <thead className="bg-gray-50/80 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Fecha</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Comprobante</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider w-full">Cliente</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Total</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Saldo</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Estado</th>
                    <th className="px-4 py-2.5 w-10"></th>
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
                    const outstanding = invoiceOutstanding(inv);
                    const overdueDays = invoiceOverdueDays(inv);
                    const delivery = inv.deliveryStatus && inv.deliveryStatus !== 'NOT_DELIVERED'
                      ? DELIVERY_CFG[inv.deliveryStatus]?.label ?? DELIVERY_STATUSES[inv.deliveryStatus]
                      : null;

                    // Segunda linea del cliente: lo que antes eran tres columnas
                    // de badges (items, condicion, entrega) sin pelearse por foco.
                    const meta = [
                      itemCount > 0 ? `${itemCount} ${itemCount === 1 ? 'ítem' : 'ítems'}` : null,
                      isCC ? 'cta. cte.' : 'contado',
                      delivery ? `entrega ${delivery.toLowerCase()}` : null,
                    ].filter(Boolean).join(' · ');

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
                        {/* Fecha — con el vencimiento solo cuando dice algo */}
                        <td className="px-4 py-3.5 whitespace-nowrap align-top">
                          <p className="text-sm font-medium text-gray-800 dark:text-slate-200 leading-none tabular-nums">
                            {formatDate(inv.date)}
                          </p>
                          {overdueDays !== null ? (
                            <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 mt-1 tabular-nums">
                              vencida hace {overdueDays} {overdueDays === 1 ? 'día' : 'días'}
                            </p>
                          ) : inv.dueDate ? (
                            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 tabular-nums">
                              vto. {formatDate(inv.dueDate)}
                            </p>
                          ) : null}
                        </td>

                        {/* Comprobante — tipo y numero juntos, el CAE como tilde */}
                        <td className="px-4 py-3.5 whitespace-nowrap align-top">
                          <div className="flex items-center gap-2">
                            <span
                              title={INVOICE_TYPES[inv.type]}
                              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ring-1 ring-inset leading-none ${chip?.cls ?? 'text-gray-600 bg-gray-50 ring-gray-200/60'}`}
                            >
                              {chip?.label ?? inv.type}
                            </span>
                            <span className="font-mono text-xs font-semibold text-gray-900 dark:text-slate-200">
                              {formatInvoiceNumber(inv)}
                            </span>
                            {inv.cae && (
                              <Check
                                className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0"
                                aria-label="Autorizada por ARCA"
                              />
                            )}
                            <FiscalModeBadge mode={(inv as any).fiscalMode} />
                          </div>
                        </td>

                        {/* Cliente + la metadata que antes ocupaba tres columnas */}
                        <td className="px-4 py-3.5 align-top">
                          {customerName ? (
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${avatarCls(customerName)}`}>
                                {customerName.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm text-gray-700 dark:text-slate-300 truncate leading-tight">{customerName}</p>
                                {meta && (
                                  <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate leading-tight mt-0.5">{meta}</p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400 dark:text-slate-500 italic text-xs">Consumidor final</span>
                          )}
                        </td>

                        {/* Total */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap align-top">
                          <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                            {formatCurrency(Number(inv.total), inv.currency)}
                          </span>
                          {inv.currency !== 'ARS' && (
                            <span className="ml-1 text-[10px] font-semibold px-1 py-0.5 rounded-full border text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/20 dark:border-amber-800">
                              {inv.currency}
                            </span>
                          )}
                        </td>

                        {/* Saldo — la pregunta que el listado no contestaba */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap align-top">
                          {outstanding > 0 ? (
                            <span className={`text-sm font-bold tabular-nums ${
                              overdueDays !== null
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}>
                              {formatCurrency(outstanding, inv.currency)}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-slate-600">—</span>
                          )}
                        </td>

                        {/* Estado */}
                        <td className="px-4 py-3.5 align-top">
                          {statusCfg && (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border leading-none ${statusCfg.cls}`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusCfg.dot}`} />
                              {statusCfg.label}
                            </span>
                          )}
                        </td>

                        {/* Abrir en pestana nueva — para revisar varias sin perder la lista */}
                        <td className="px-2 py-3.5 align-top">
                          <a
                            href={`/invoices/${inv.id}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Abrir en una pestaña nueva"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-gray-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-all"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
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
