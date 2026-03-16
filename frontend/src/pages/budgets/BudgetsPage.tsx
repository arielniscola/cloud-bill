import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, FileText, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card } from '../../components/ui';
import { PageHeader, CustomerSearchSelect } from '../../components/shared';
import Pagination from '../../components/shared/Pagination';
import { budgetsService, customersService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  BUDGET_STATUSES,
  BUDGET_STATUS_OPTIONS,
  DEFAULT_PAGE_SIZE,
} from '../../utils/constants';
import type { Budget, Customer } from '../../types';

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
  DRAFT:          { label: 'Borrador',      cls: 'text-gray-600 bg-gray-100 border-gray-200 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600',                dot: 'bg-gray-400' },
  SENT:           { label: 'Enviado',       cls: 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-900/30 dark:border-blue-800',                 dot: 'bg-blue-500' },
  ACCEPTED:       { label: 'Aceptado',      cls: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-800', dot: 'bg-emerald-500' },
  REJECTED:       { label: 'Rechazado',     cls: 'text-red-600 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/30 dark:border-red-800',                       dot: 'bg-red-500' },
  CONVERTED:      { label: 'Convertido',    cls: 'text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-900/30 dark:border-violet-800',     dot: 'bg-violet-500' },
  EXPIRED:        { label: 'Vencido',       cls: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/30 dark:border-amber-800',           dot: 'bg-amber-500' },
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
          <td className="px-4 py-4"><div className="h-3.5 bg-gray-100 dark:bg-slate-700 rounded w-20" /></td>
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
export default function BudgetsPage() {
  const navigate = useNavigate();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  const [statusFilter, setStatusFilter] = useState('');
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

  const fetchBudgets = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await budgetsService.getAll({
        page, limit,
        status: statusFilter || undefined,
        customerId: customerFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setBudgets(response.data);
      setTotal(response.total);
    } catch {
      toast.error('Error al cargar presupuestos');
    } finally {
      setIsLoading(false);
      setIsFirstLoad(false);
    }
  }, [page, limit, statusFilter, customerFilter, dateFrom, dateTo]);

  useEffect(() => { fetchBudgets(); }, [fetchBudgets]);

  const hasFilters = !!(statusFilter || customerFilter || saleConditionFilter || dateFrom || dateTo);
  const clearFilters = () => {
    setStatusFilter(''); setCustomerFilter('');
    setSaleConditionFilter(''); setDateFrom(''); setDateTo(''); setPage(1);
  };

  // Page stats
  const pageStats = useMemo(() => {
    const totalAmt = budgets.reduce((s, b) => s + Number(b.total), 0);
    const accepted = budgets.filter((b) => ['ACCEPTED', 'PAID', 'PARTIALLY_PAID', 'CONVERTED'].includes(b.status)).length;
    const pending  = budgets.filter((b) => ['DRAFT', 'SENT'].includes(b.status)).length;
    return { totalAmt, accepted, pending };
  }, [budgets]);

  // Client-side saleCondition filter (not sent to backend — filter locally)
  const visibleBudgets = useMemo(() => {
    if (!saleConditionFilter) return budgets;
    return budgets.filter((b) => b.saleCondition === saleConditionFilter);
  }, [budgets, saleConditionFilter]);

  const showSkeleton = isFirstLoad && isLoading;
  const showEmpty = !isLoading && !isFirstLoad && visibleBudgets.length === 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Presupuestos"
        subtitle={`${total} ${total === 1 ? 'presupuesto' : 'presupuestos'}${hasFilters ? ' · filtros activos' : ''}`}
        actions={
          <Button onClick={() => navigate('/budgets/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo presupuesto
          </Button>
        }
      />

      {/* ── Stats strip ── */}
      {!isFirstLoad && budgets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
            <div className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{total}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Presupuestos{hasFilters ? ' (filtrados)' : ''}</div>
          </div>
          <button
            onClick={() => setStatusFilter((f) => (f === 'ACCEPTED' ? '' : 'ACCEPTED'))}
            className={`text-left rounded-xl px-4 py-3.5 border transition-all duration-150 active:scale-[0.98] ${
              statusFilter === 'ACCEPTED'
                ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 ring-1 ring-emerald-300'
                : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-emerald-200 hover:bg-emerald-50/30'
            }`}
          >
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 leading-none">{pageStats.accepted}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Aceptados / pagados</div>
          </button>
          <button
            onClick={() => setStatusFilter((f) => (f === 'DRAFT' ? '' : 'DRAFT'))}
            className={`text-left rounded-xl px-4 py-3.5 border transition-all duration-150 active:scale-[0.98] ${
              statusFilter === 'DRAFT'
                ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 ring-1 ring-amber-300'
                : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-amber-200 hover:bg-amber-50/30'
            }`}
          >
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 leading-none">{pageStats.pending}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Borradores / enviados</div>
          </button>
        </div>
      )}

      <Card padding="none">
        {/* ── Filters ── */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 space-y-2.5">
          {/* Row 1 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Estado */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-[34px] px-2.5 pr-7 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all appearance-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
            >
              <option value="">Todos los estados</option>
              {BUDGET_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                  {['Fecha', 'Tipo', 'Número', 'Cliente', 'Válido hasta', 'Total', 'Estado'].map((h) => (
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
              <FileText className="w-5 h-5 text-gray-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-1">
              {hasFilters ? 'Sin resultados' : 'Sin presupuestos todavía'}
            </p>
            <p className="text-sm text-gray-400 dark:text-slate-500 mb-5 max-w-xs">
              {hasFilters ? 'Probá ajustando los filtros.' : 'Creá tu primer presupuesto para comenzar a gestionar ventas.'}
            </p>
            {hasFilters
              ? <button onClick={clearFilters} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Limpiar filtros</button>
              : <Button onClick={() => navigate('/budgets/new')}><Plus className="w-4 h-4 mr-2" />Nuevo presupuesto</Button>
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
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Válido hasta</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Total</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Estado</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700">
                  {visibleBudgets.map((b) => {
                    const chip = TYPE_CHIP[b.type];
                    const statusCfg = STATUS_CFG[b.status];
                    const customerName = b.customer?.name ?? '';

                    return (
                      <tr
                        key={b.id}
                        className="cursor-pointer group transition-colors duration-100 hover:bg-indigo-50/30 dark:hover:bg-slate-700/50"
                        onClick={() => navigate(`/budgets/${b.id}`)}
                      >
                        {/* Fecha */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <p className="text-sm font-medium text-gray-800 dark:text-slate-200 leading-none tabular-nums">
                            {formatDate(b.date)}
                          </p>
                        </td>

                        {/* Tipo */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ring-1 ring-inset leading-none ${chip?.cls ?? 'text-gray-600 bg-gray-50 ring-gray-200/60'}`}
                          >
                            {chip?.label ?? b.type}
                          </span>
                        </td>

                        {/* Número */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="font-mono text-xs text-gray-600 dark:text-slate-400">{b.number}</span>
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

                        {/* Válido hasta */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {b.validUntil ? (
                            <span className="text-sm text-gray-500 dark:text-slate-400 tabular-nums">{formatDate(b.validUntil)}</span>
                          ) : (
                            <span className="text-gray-300 dark:text-slate-600">—</span>
                          )}
                        </td>

                        {/* Total */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                            {formatCurrency(Number(b.total), b.currency)}
                          </span>
                          {b.currency !== 'ARS' && (
                            <span className="ml-1 text-[10px] font-semibold px-1 py-0.5 rounded-full border text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/20 dark:border-amber-800">
                              {b.currency}
                            </span>
                          )}
                        </td>

                        {/* Estado */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          {statusCfg && (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border leading-none ${statusCfg.cls}`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusCfg.dot}`} />
                              {statusCfg.label}
                            </span>
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
