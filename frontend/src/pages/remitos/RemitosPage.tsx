import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, X, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge } from '../../components/ui';
import { PageHeader, CustomerSearchSelect } from '../../components/shared';
import Pagination from '../../components/shared/Pagination';
import { remitosService, customersService } from '../../services';
import { formatDate } from '../../utils/formatters';
import {
  REMITO_STATUSES,
  REMITO_STATUS_OPTIONS,
  DEFAULT_PAGE_SIZE,
} from '../../utils/constants';
import type { Remito, RemitoStatus, Customer } from '../../types';

// ── Helpers ────────────────────────────────────────────────────────
type StatusVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

const STATUS_VARIANT: Record<string, StatusVariant> = {
  PENDING:              'warning',
  PARTIALLY_DELIVERED:  'info',
  DELIVERED:            'success',
  CANCELLED:            'error',
};

const BEHAVIOR_CHIP = {
  DISCOUNT: { label: 'Inmediata', cls: 'text-emerald-700 bg-emerald-50 ring-emerald-200/60' },
  RESERVE:  { label: 'Reserva',  cls: 'text-sky-700 bg-sky-50 ring-sky-200/60' },
};

// ── Compact native select ──────────────────────────────────────────
function CompactSelect({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none pl-3 pr-7 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500 ${
          value
            ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-400'
            : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 text-[10px]">▾</span>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────
function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="animate-pulse border-b border-gray-100 dark:border-slate-700 last:border-0">
          <td className="px-4 py-4"><div className="h-4 bg-gray-100 dark:bg-slate-700 rounded-md w-28" /></td>
          <td className="px-4 py-4"><div className="h-5 bg-gray-100 dark:bg-slate-700 rounded-full w-20" /></td>
          <td className="px-4 py-4"><div className="h-4 bg-gray-100 dark:bg-slate-700 rounded-md w-44" /></td>
          <td className="px-4 py-4"><div className="h-4 bg-gray-100 dark:bg-slate-700 rounded-md w-20" /></td>
          <td className="px-4 py-4"><div className="h-5 bg-gray-100 dark:bg-slate-700 rounded-full w-24 mx-auto" /></td>
          <td className="px-4 py-4" />
        </tr>
      ))}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────
export default function RemitosPage() {
  const navigate = useNavigate();

  // Data
  const [remitos,   setRemitos]   = useState<Remito[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading,    setIsLoading]    = useState(true);
  const [isFirstLoad,  setIsFirstLoad]  = useState(true);
  const [page,  setPage]  = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  // Filters
  const [statusFilter,   setStatusFilter]   = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');

  // Load customers once
  useEffect(() => {
    customersService.getAll({ limit: 1000 })
      .then(res => setCustomers(res.data))
      .catch(() => {});
  }, []);

  const fetchRemitos = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await remitosService.getAll({
        page,
        limit,
        status:     (statusFilter   || undefined) as RemitoStatus | undefined,
        customerId:  customerFilter || undefined,
        dateFrom:    dateFrom       || undefined,
        dateTo:      dateTo         || undefined,
      });
      setRemitos(response.data);
      setTotal(response.total);
    } catch {
      toast.error('Error al cargar remitos');
    } finally {
      setIsLoading(false);
      setIsFirstLoad(false);
    }
  }, [page, limit, statusFilter, customerFilter, dateFrom, dateTo]);

  useEffect(() => { fetchRemitos(); }, [fetchRemitos]);

  const clearFilters = () => {
    setStatusFilter('');
    setCustomerFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const hasFilters = !!(statusFilter || customerFilter || dateFrom || dateTo);

  const showSkeleton = isFirstLoad && isLoading;
  const showEmpty    = !isLoading && !isFirstLoad && remitos.length === 0;

  return (
    <div>
      <PageHeader
        title="Remitos"
        subtitle={
          total > 0
            ? `${total} remito${total !== 1 ? 's' : ''}${hasFilters ? ' · filtros activos' : ''}`
            : undefined
        }
        actions={
          <Button onClick={() => navigate('/remitos/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo remito
          </Button>
        }
      />

      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {/* ── Filter bar ── */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2">

            {/* Estado */}
            <CompactSelect
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
              placeholder="Estado"
              options={REMITO_STATUS_OPTIONS}
            />

            {/* Fecha desde → hasta */}
            <div className="flex flex-wrap items-center gap-1">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all dark:placeholder:text-slate-500"
              />
              <span className="text-gray-300 dark:text-slate-600 text-xs">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all dark:placeholder:text-slate-500"
              />
            </div>

            {/* Cliente */}
            <div className="w-52">
              <CustomerSearchSelect
                customers={customers}
                value={customerFilter}
                onChange={(v) => { setCustomerFilter(v); setPage(1); }}
                clearLabel="Todos los clientes"
              />
            </div>

            {/* Limpiar */}
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                <X className="w-3 h-3" />
                Limpiar
              </button>
            )}
          </div>

          {/* Active filter chips */}
          {hasFilters && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {statusFilter && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700">
                  {REMITO_STATUSES[statusFilter as RemitoStatus]}
                  <button onClick={() => { setStatusFilter(''); setPage(1); }}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              )}
              {customerFilter && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700">
                  {customers.find(c => c.id === customerFilter)?.name ?? 'Cliente'}
                  <button onClick={() => { setCustomerFilter(''); setPage(1); }}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              )}
              {(dateFrom || dateTo) && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700">
                  {dateFrom && dateTo
                    ? `${dateFrom} → ${dateTo}`
                    : dateFrom
                    ? `desde ${dateFrom}`
                    : `hasta ${dateTo}`}
                  <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Skeleton ── */}
        {showSkeleton && (
          <div className="overflow-x-auto">
            <table className="min-w-full min-w-[600px]">
              <thead className="bg-gray-50/80 dark:bg-slate-700/50">
                <tr>
                  {['Número', 'Tipo', 'Cliente', 'Fecha', 'Estado', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800">
                <SkeletonRows count={8} />
              </tbody>
            </table>
          </div>
        )}

        {/* ── Empty state ── */}
        {showEmpty && (
          <div className="py-20 flex flex-col items-center text-center px-4">
            <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-4">
              <ClipboardList className="w-5 h-5 text-gray-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-1">
              {hasFilters ? 'Sin resultados' : 'Sin remitos todavía'}
            </p>
            <p className="text-sm text-gray-400 dark:text-slate-500 mb-5 max-w-xs">
              {hasFilters
                ? 'Probá ajustando los filtros para encontrar lo que buscás.'
                : 'Creá tu primer remito para registrar entregas de mercadería.'}
            </p>
            {hasFilters ? (
              <button
                onClick={clearFilters}
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline"
              >
                Limpiar filtros
              </button>
            ) : (
              <Button onClick={() => navigate('/remitos/new')}>
                <Plus className="w-4 h-4 mr-2" />
                Nuevo remito
              </Button>
            )}
          </div>
        )}

        {/* ── Data table ── */}
        {!showSkeleton && !showEmpty && (
          <div className={`transition-opacity duration-200 ${isLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <div className="overflow-x-auto">
              <table className="min-w-full min-w-[600px]">
                <thead className="bg-gray-50/80 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Número</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Tipo entrega</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Cliente</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Fecha</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Estado</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700">
                  {remitos.map((rem) => {
                    const chip = BEHAVIOR_CHIP[rem.stockBehavior];
                    return (
                      <tr
                        key={rem.id}
                        className="cursor-pointer hover:bg-gray-50/80 dark:hover:bg-slate-700 transition-colors duration-150 group"
                        onClick={() => navigate(`/remitos/${rem.id}`)}
                      >
                        <td className="px-4 py-3.5 text-sm font-semibold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">
                          {rem.number}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ring-1 ring-inset ${chip.cls}`}>
                            {chip.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-gray-700 dark:text-slate-300 max-w-[200px] truncate">
                          {rem.customer?.name ?? <span className="text-gray-400 dark:text-slate-500 italic text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                          {formatDate(rem.date)}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <Badge variant={STATUS_VARIANT[rem.status] ?? 'default'} dot>
                            {REMITO_STATUSES[rem.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/remitos/${rem.id}`); }}
                            className="p-1.5 rounded-lg text-gray-300 dark:text-slate-600 group-hover:text-gray-500 dark:group-hover:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors duration-150"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
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
                onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
