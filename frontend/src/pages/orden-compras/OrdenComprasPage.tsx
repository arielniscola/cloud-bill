import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Search, FileStack } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import FiscalModeBadge from '../../components/shared/FiscalModeBadge';
import { ordenComprasService, suppliersService } from '../../services';
import { useFiscalModeStore } from '../../stores/fiscalMode.store';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { OrdenCompra, OrdenCompraStatus, OrdenCompraFilters } from '../../types';
import type { Supplier } from '../../types';

const STATUS_CFG: Record<OrdenCompraStatus, { label: string; className: string }> = {
  DRAFT:     { label: 'Borrador',   className: 'text-gray-600 bg-gray-50 border-gray-200 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600' },
  SENT:      { label: 'Enviada',    className: 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/30 dark:border-blue-800' },
  CONFIRMED: { label: 'Confirmada', className: 'text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-400 dark:bg-indigo-900/30 dark:border-indigo-800' },
  RECEIVED:  { label: 'Recibida',   className: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-800' },
  CANCELLED: { label: 'Cancelada',  className: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800' },
};

const PAYMENT_STATUS_CFG: Record<string, { label: string; className: string }> = {
  PENDING:        { label: 'Sin pagar',    className: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/30 dark:border-amber-800' },
  PARTIALLY_PAID: { label: 'Pago parcial', className: 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/30 dark:border-blue-800' },
  PAID:           { label: 'Pagado',       className: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-800' },
};

type StatusTab = 'all' | OrdenCompraStatus;

const TABS: { id: StatusTab; label: string }[] = [
  { id: 'all',       label: 'Todas' },
  { id: 'DRAFT',     label: 'Borradores' },
  { id: 'SENT',      label: 'Enviadas' },
  { id: 'CONFIRMED', label: 'Confirmadas' },
  { id: 'RECEIVED',  label: 'Recibidas' },
  { id: 'CANCELLED', label: 'Canceladas' },
];

const GRID_COLS = 'grid-cols-[180px_1fr_120px_140px_120px_120px_60px]';

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-[34px] px-2.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
    />
  );
}

export default function OrdenComprasPage() {
  const navigate = useNavigate();

  const [ocs, setOcs]             = useState<OrdenCompra[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const LIMIT = 20;

  const [statusTab, setStatusTab]   = useState<StatusTab>('all');
  const [supplierId, setSupplierId] = useState('');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [search, setSearch]         = useState('');
  const fiscalMode = useFiscalModeStore((s) => s.viewMode);

  useEffect(() => {
    suppliersService.getAll({ limit: 200, isActive: true }).then((r) => setSuppliers(r.data));
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await ordenComprasService.getAll({
        page, limit: LIMIT,
        supplierId: supplierId || undefined,
        status:     statusTab !== 'all' ? statusTab as OrdenCompraStatus : undefined,
        dateFrom:   dateFrom || undefined,
        dateTo:     dateTo   || undefined,
      });
      let data = res.data;
      if (search) {
        const q = search.toLowerCase();
        data = data.filter((oc) =>
          oc.number.toLowerCase().includes(q) ||
          oc.supplier?.name.toLowerCase().includes(q)
        );
      }
      setOcs(data);
      setTotal(res.total);
      setTotalPages(res.totalPages ?? Math.ceil(res.total / LIMIT));
    } catch {
      toast.error('Error al cargar órdenes de compra');
    } finally {
      setIsLoading(false);
    }
  }, [page, supplierId, statusTab, dateFrom, dateTo, search, fiscalMode]);

  useEffect(() => { load(); }, [load]);

  const clearFilters = () => {
    setSupplierId(''); setStatusTab('all'); setDateFrom(''); setDateTo(''); setSearch(''); setPage(1);
  };
  const hasFilters = !!(supplierId || statusTab !== 'all' || dateFrom || dateTo || search);

  // Page-level stats (current loaded data)
  const pageStats = useMemo(() => {
    const totalAmount      = ocs.reduce((s, oc) => s + Number(oc.total), 0);
    const pendingReceive   = ocs.filter((oc) => oc.status === 'SENT' || oc.status === 'CONFIRMED').length;
    const pendingPayAmount = ocs.reduce((s, oc) => {
      if (!oc.purchase) return s;
      const paid    = Number(oc.purchase.paidAmount ?? 0);
      const total   = Number(oc.purchase.total ?? oc.total);
      return s + Math.max(0, total - paid);
    }, 0);
    return { totalAmount, pendingReceive, pendingPayAmount };
  }, [ocs]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Órdenes de Compra"
        subtitle={`${total} ${total === 1 ? 'orden' : 'órdenes'}${hasFilters ? ' · filtros activos' : ''}`}
        actions={
          <Button onClick={() => navigate('/orden-compras/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva OC
          </Button>
        }
      />

      {/* ── Stats strip ── */}
      {!isLoading && ocs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
            <div className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{total}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Órdenes{hasFilters ? ' (filtradas)' : ''}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
            <div className="text-xl font-bold text-gray-900 dark:text-white leading-none truncate">
              {formatCurrency(pageStats.totalAmount, 'ARS')}
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Total en esta página</div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 leading-none">
              {pageStats.pendingReceive}
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Pendientes de recibir</div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400 leading-none truncate">
              {formatCurrency(pageStats.pendingPayAmount, 'ARS')}
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Pendiente de pago</div>
          </div>
        </div>
      )}

      {/* Filter bar with tabs */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 space-y-3">
        {/* Status tabs */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl w-fit">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setStatusTab(t.id); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                statusTab === t.id
                  ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Other filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Número o proveedor…"
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 w-48"
            />
          </div>

          <select
            value={supplierId}
            onChange={(e) => { setSupplierId(e.target.value); setPage(1); }}
            className="h-[34px] px-2.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          >
            <option value="">Todos los proveedores</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <DateInput value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1); }} />
          <DateInput value={dateTo}   onChange={(v) => { setDateTo(v);   setPage(1); }} />

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors ml-auto"
            >
              <X className="w-3.5 h-3.5" />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className={`grid ${GRID_COLS} gap-x-4 px-4 py-2.5 border-b border-gray-100 dark:border-slate-700 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider`}>
          <span>Número</span>
          <span>Proveedor</span>
          <span>Fecha</span>
          <span className="text-right">Total</span>
          <span>Estado</span>
          <span>Pago</span>
          <span></span>
        </div>

        {isLoading ? (
          <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`grid ${GRID_COLS} gap-x-4 px-4 py-3 animate-pulse items-center`}>
                <div className="h-4 w-32 bg-gray-100 dark:bg-slate-700 rounded" />
                <div className="h-4 w-40 bg-gray-100 dark:bg-slate-700 rounded" />
                <div className="h-4 w-24 bg-gray-100 dark:bg-slate-700 rounded" />
                <div className="h-4 w-24 bg-gray-100 dark:bg-slate-700 rounded ml-auto" />
                <div className="h-5 w-24 bg-gray-100 dark:bg-slate-700 rounded-full" />
                <div className="h-5 w-20 bg-gray-100 dark:bg-slate-700 rounded-full" />
                <div className="h-4 w-10 bg-gray-100 dark:bg-slate-700 rounded ml-auto" />
              </div>
            ))}
          </div>
        ) : ocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-4">
              <FileStack className="w-7 h-7 text-gray-300 dark:text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
              {hasFilters ? 'Sin resultados' : 'Sin órdenes de compra'}
            </p>
            <p className="text-sm text-gray-400 dark:text-slate-500 max-w-sm leading-relaxed mb-5">
              {hasFilters
                ? 'No hay órdenes que coincidan con los filtros activos.'
                : 'Creá tu primera orden de compra para empezar a gestionar pedidos a proveedores.'}
            </p>
            {hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                <X className="w-4 h-4 mr-1.5" />
                Limpiar filtros
              </Button>
            ) : (
              <Button onClick={() => navigate('/orden-compras/new')}>
                <Plus className="w-4 h-4 mr-2" />
                Nueva OC
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {ocs.map((oc) => {
              const cfg = STATUS_CFG[oc.status];
              const pcfg = oc.purchase ? PAYMENT_STATUS_CFG[oc.purchase.paymentStatus] : null;
              return (
                <div
                  key={oc.id}
                  onClick={() => navigate(`/orden-compras/${oc.id}`)}
                  className={`grid ${GRID_COLS} gap-x-4 px-4 py-3 items-center hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-mono font-semibold text-gray-900 dark:text-white truncate">{oc.number}</span>
                    <FiscalModeBadge mode={(oc as any).fiscalMode} />
                  </div>
                  <span className="text-sm text-gray-700 dark:text-slate-300 truncate">{oc.supplier?.name ?? '—'}</span>
                  <span className="text-sm text-gray-500 dark:text-slate-400 tabular-nums">{formatDate(oc.date)}</span>
                  <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white text-right">
                    {formatCurrency(Number(oc.total), oc.currency as 'ARS' | 'USD')}
                  </span>
                  <span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.className}`}>
                      {cfg.label}
                    </span>
                  </span>
                  <span>
                    {pcfg ? (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${pcfg.className}`}>
                        {pcfg.label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 dark:text-slate-600">—</span>
                    )}
                  </span>
                  <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium text-right">Ver →</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
            <span className="text-xs text-gray-400 dark:text-slate-500">{total} resultado{total !== 1 ? 's' : ''}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="px-2.5 py-1 rounded-lg text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed">‹</button>
              <span className="text-xs text-gray-600 dark:text-slate-400 px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} className="px-2.5 py-1 rounded-lg text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed">›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
