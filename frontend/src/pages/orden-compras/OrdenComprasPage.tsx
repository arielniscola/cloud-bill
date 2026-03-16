import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { ordenComprasService, suppliersService } from '../../services';
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

  const [filters, setFilters] = useState<OrdenCompraFilters>({});
  const [supplierId, setSupplierId] = useState('');
  const [status, setStatus]         = useState('');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [search, setSearch]         = useState('');

  useEffect(() => {
    suppliersService.getAll({ limit: 200, isActive: true }).then((r) => setSuppliers(r.data));
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await ordenComprasService.getAll({
        page, limit: LIMIT,
        supplierId: supplierId || undefined,
        status:     (status as OrdenCompraStatus) || undefined,
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
  }, [page, supplierId, status, dateFrom, dateTo, search]);

  useEffect(() => { load(); }, [load]);

  const clearFilters = () => {
    setSupplierId(''); setStatus(''); setDateFrom(''); setDateTo(''); setSearch(''); setPage(1);
  };
  const hasFilters = !!(supplierId || status || dateFrom || dateTo || search);

  return (
    <div>
      <PageHeader
        title="Órdenes de Compra"
        subtitle={`${total} orden${total !== 1 ? 'es' : ''}`}
        actions={
          <Button onClick={() => navigate('/orden-compras/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva OC
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 mb-4 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Número o proveedor…"
            className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 w-48"
          />
        </div>

        {/* Supplier */}
        <select
          value={supplierId}
          onChange={(e) => { setSupplierId(e.target.value); setPage(1); }}
          className="h-[34px] px-2.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        >
          <option value="">Todos los proveedores</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Status */}
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-[34px] px-2.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_140px_100px_110px_80px] gap-x-4 px-4 py-2.5 border-b border-gray-100 dark:border-slate-700 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
          <span>Número</span>
          <span>Proveedor</span>
          <span>Fecha</span>
          <span>Total</span>
          <span>Estado</span>
          <span></span>
        </div>

        {isLoading ? (
          <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_140px_100px_110px_80px] gap-x-4 px-4 py-3 animate-pulse">
                <div className="h-4 w-28 bg-gray-100 dark:bg-slate-700 rounded" />
                <div className="h-4 w-40 bg-gray-100 dark:bg-slate-700 rounded" />
                <div className="h-4 w-24 bg-gray-100 dark:bg-slate-700 rounded" />
                <div className="h-4 w-20 bg-gray-100 dark:bg-slate-700 rounded" />
                <div className="h-5 w-24 bg-gray-100 dark:bg-slate-700 rounded-full" />
                <div className="h-4 w-16 bg-gray-100 dark:bg-slate-700 rounded" />
              </div>
            ))}
          </div>
        ) : ocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Sin órdenes de compra</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">Creá una nueva para empezar</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {ocs.map((oc) => {
              const cfg = STATUS_CFG[oc.status];
              return (
                <div
                  key={oc.id}
                  onClick={() => navigate(`/orden-compras/${oc.id}`)}
                  className="grid grid-cols-[auto_1fr_140px_100px_110px_80px] gap-x-4 px-4 py-3 items-center hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors"
                >
                  <span className="text-sm font-mono font-semibold text-gray-900 dark:text-white">{oc.number}</span>
                  <span className="text-sm text-gray-700 dark:text-slate-300 truncate">{oc.supplier?.name ?? '—'}</span>
                  <span className="text-sm text-gray-500 dark:text-slate-400 tabular-nums">{formatDate(oc.date)}</span>
                  <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                    {formatCurrency(Number(oc.total), oc.currency as 'ARS' | 'USD')}
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.className}`}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Ver →</span>
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
