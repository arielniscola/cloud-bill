import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, XCircle, X, Building2, ShoppingCart,
  Package, Warehouse, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Button } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { purchasesService, suppliersService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { INVOICE_TYPES, DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { Purchase, PurchaseStatus } from '../../types';
import type { Supplier } from '../../types';

// ── Status config ────────────────────────────────────────────────
const STATUS_CFG: Record<PurchaseStatus, { label: string; className: string }> = {
  REGISTERED: { label: 'Registrada', className: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-800' },
  CANCELLED:  { label: 'Cancelada',  className: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800' },
};

const PAYMENT_STATUS_CFG: Record<string, { label: string; className: string }> = {
  PENDING:        { label: 'Sin pagar',    className: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/30 dark:border-amber-800' },
  PARTIALLY_PAID: { label: 'Pago parcial', className: 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/30 dark:border-blue-800' },
  PAID:           { label: 'Pagado',       className: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-800' },
};

// ── Avatar helper ────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-orange-100 text-orange-700',
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
];
function avatarClass(name: string) {
  const hash = name.split('').reduce((acc, c) => c.charCodeAt(0) + acc, 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
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

// ── Pagination ───────────────────────────────────────────────────
function Pagination({
  page, totalPages, onPageChange,
}: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ‹
      </button>
      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
        const p = totalPages <= 7 ? i + 1 : i === 0 ? 1 : i === 6 ? totalPages : page - 2 + i;
        return (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
              p === page
                ? 'bg-indigo-600 text-white'
                : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
            }`}
          >
            {p}
          </button>
        );
      })}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ›
      </button>
    </div>
  );
}

// ── Skeleton row ─────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100 dark:border-slate-700 animate-pulse">
      <td className="px-4 py-4">
        <div className="h-3.5 bg-gray-100 dark:bg-slate-700 rounded w-20 mb-1.5" />
        <div className="h-2.5 bg-gray-100 dark:bg-slate-700 rounded w-32 mb-1.5" />
        <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded-full w-16" />
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex-shrink-0" />
          <div>
            <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-32 mb-1.5" />
            <div className="h-2.5 bg-gray-100 dark:bg-slate-700 rounded w-20" />
          </div>
        </div>
      </td>
      <td className="px-4 py-4"><div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-20" /></td>
      <td className="px-4 py-4">
        <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-24 mb-1.5 ml-auto" />
        <div className="h-2.5 bg-gray-100 dark:bg-slate-700 rounded w-16 ml-auto" />
        <div className="h-3.5 bg-gray-100 dark:bg-slate-700 rounded w-28 mt-1.5 ml-auto" />
      </td>
      <td className="px-4 py-4"><div className="h-5 bg-gray-100 dark:bg-slate-700 rounded-full w-20" /></td>
      <td className="px-4 py-4"><div className="h-5 bg-gray-100 dark:bg-slate-700 rounded-full w-16" /></td>
      <td className="px-4 py-4 w-10" />
    </tr>
  );
}

type StatusTab = 'all' | PurchaseStatus;

export default function PurchasesPage() {
  const navigate = useNavigate();
  const [purchases, setPurchases]   = useState<Purchase[]>([]);
  const [suppliers, setSuppliers]   = useState<Supplier[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [cancelId,  setCancelId]    = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);

  const [statusTab,    setStatusTab]    = useState<StatusTab>('all');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierSearch, setShowSupplierSearch] = useState(false);
  const [page,  setPage]  = useState(1);
  const [limit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const hasFilters = !!(statusTab !== 'all' || dateFrom || dateTo || supplierFilter);

  // Load suppliers for filter
  useEffect(() => {
    suppliersService.getAll({ limit: 500 })
      .then((r) => setSuppliers(r.data))
      .catch(() => {});
  }, []);

  const fetchPurchases = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await purchasesService.getAll({
        page,
        limit,
        ...(statusTab !== 'all'  && { status: statusTab }),
        ...(dateFrom             && { dateFrom }),
        ...(dateTo               && { dateTo }),
        ...(supplierFilter       && { supplierId: supplierFilter }),
      });
      setPurchases(res.data);
      setTotal(res.total);
    } catch {
      toast.error('Error al cargar compras');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, statusTab, dateFrom, dateTo, supplierFilter]);

  useEffect(() => { fetchPurchases(); }, [fetchPurchases]);

  const clearFilters = () => {
    setStatusTab('all'); setDateFrom(''); setDateTo('');
    setSupplierFilter(''); setSupplierSearch(''); setPage(1);
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    setIsCanceling(true);
    try {
      await purchasesService.cancel(cancelId);
      toast.success('Compra cancelada');
      setCancelId(null);
      fetchPurchases();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al cancelar compra');
    } finally {
      setIsCanceling(false);
    }
  };

  // Stats from current loaded data
  const pageStats = useMemo(() => {
    const totalAmount = purchases.reduce((s, p) => s + Number(p.total), 0);
    const totalTax    = purchases.reduce((s, p) => s + Number(p.taxAmount), 0);
    const registered  = purchases.filter((p) => p.status === 'REGISTERED').length;
    return { totalAmount, totalTax, registered };
  }, [purchases]);

  // Filtered suppliers for search
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers;
    const q = supplierSearch.trim().toLowerCase();
    return suppliers.filter((s) => s.name.toLowerCase().includes(q) || s.cuit?.includes(q));
  }, [suppliers, supplierSearch]);

  const selectedSupplierName = suppliers.find((s) => s.id === supplierFilter)?.name;

  const TABS: { id: StatusTab; label: string }[] = [
    { id: 'all',        label: 'Todas' },
    { id: 'REGISTERED', label: 'Registradas' },
    { id: 'CANCELLED',  label: 'Canceladas' },
  ];

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Compras"
        subtitle={`${total} ${total === 1 ? 'compra' : 'compras'}${hasFilters ? ' · filtros activos' : ''}`}
        actions={
          <Button onClick={() => navigate('/purchases/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva compra
          </Button>
        }
      />

      {/* ── Stats strip ── */}
      {!isLoading && purchases.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
            <div className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{total}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Compras{hasFilters ? ' (filtradas)' : ''}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
            <div className="text-xl font-bold text-gray-900 dark:text-white leading-none truncate">
              {formatCurrency(pageStats.totalAmount, 'ARS')}
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Total en esta página</div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
            <div className="text-xl font-bold text-violet-600 dark:text-violet-400 leading-none truncate">
              {formatCurrency(pageStats.totalTax, 'ARS')}
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">IVA en esta página</div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 leading-none">
              {pageStats.registered}
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Registradas</div>
          </div>
        </div>
      )}

      <Card padding="none">
        {/* ── Toolbar ── */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 space-y-3">
          {/* Row 1: tabs + date range */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Status tabs */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl">
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

            {/* Date range */}
            <div className="flex items-center gap-1.5">
              <DateInput value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1); }} />
              <span className="text-gray-300 dark:text-slate-600 text-xs select-none">→</span>
              <DateInput value={dateTo} onChange={(v) => { setDateTo(v); setPage(1); }} />
            </div>

            {/* Supplier filter */}
            <div className="relative">
              <button
                onClick={() => setShowSupplierSearch((s) => !s)}
                className={`flex items-center gap-1.5 h-[34px] px-3 text-xs font-medium rounded-lg border transition-all duration-150 ${
                  supplierFilter
                    ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400'
                    : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                {supplierFilter ? (selectedSupplierName ?? 'Proveedor') : 'Proveedor'}
                {supplierFilter && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); setSupplierFilter(''); setSupplierSearch(''); setPage(1); }}
                    className="ml-0.5 text-orange-400 hover:text-orange-600"
                  >
                    <X className="w-3 h-3" />
                  </span>
                )}
              </button>

              {showSupplierSearch && (
                <div className="absolute top-full mt-1.5 left-0 z-20 w-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-gray-100 dark:border-slate-700">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      <input
                        autoFocus
                        type="text"
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                        placeholder="Buscar proveedor..."
                        className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-gray-800 dark:text-slate-200 placeholder-gray-400"
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto py-1">
                    <button
                      onClick={() => { setSupplierFilter(''); setSupplierSearch(''); setShowSupplierSearch(false); setPage(1); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      Todos los proveedores
                    </button>
                    {filteredSuppliers.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400 dark:text-slate-500">Sin resultados</p>
                    ) : (
                      filteredSuppliers.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { setSupplierFilter(s.id); setSupplierSearch(''); setShowSupplierSearch(false); setPage(1); }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${
                            s.id === supplierFilter ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-800 dark:text-slate-200'
                          }`}
                        >
                          <div>{s.name}</div>
                          {s.cuit && <div className="font-mono text-[10px] text-gray-400 mt-0.5">{s.cuit}</div>}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Clear */}
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-3 h-3" />
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Click outside to close supplier dropdown */}
        {showSupplierSearch && (
          <div className="fixed inset-0 z-10" onClick={() => setShowSupplierSearch(false)} />
        )}

        {/* ── Table ── */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50/80 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Fecha · Nº · Tipo</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Proveedor</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Ítems</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Subtotal · IVA · Total</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Almacén</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Estado</th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                        <ShoppingCart className="w-6 h-6 text-gray-300 dark:text-slate-500" />
                      </div>
                      <p className="text-sm font-medium text-gray-600 dark:text-slate-400">
                        {hasFilters ? 'Sin resultados para los filtros aplicados' : 'No hay compras registradas'}
                      </p>
                      {hasFilters ? (
                        <button onClick={clearFilters} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                          Limpiar filtros
                        </button>
                      ) : (
                        <Button size="sm" onClick={() => navigate('/purchases/new')}>
                          <Plus className="w-4 h-4 mr-1.5" />Nueva compra
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                purchases.map((p) => {
                  const cfg = STATUS_CFG[p.status];
                  const supplierInitial = p.supplier?.name?.charAt(0).toUpperCase() ?? '?';
                  const supplierAvatar = avatarClass(p.supplier?.name ?? '');
                  const itemCount = p.items?.length ?? 0;
                  const firstItem = p.items?.[0];
                  const isCancelled = p.status === 'CANCELLED';

                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/purchases/${p.id}`)}
                      className={`group cursor-pointer transition-colors duration-100 ${
                        isCancelled
                          ? 'bg-gray-50/60 dark:bg-slate-800/40 hover:bg-gray-100/60 dark:hover:bg-slate-700/40 opacity-70'
                          : 'hover:bg-indigo-50/30 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      {/* Fecha · Nº · Tipo */}
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-medium text-gray-800 dark:text-slate-200 leading-none">
                          {formatDate(p.date)}
                        </p>
                        <p className="font-mono text-[11px] text-gray-400 dark:text-slate-500 mt-1 leading-none">
                          {p.number}
                        </p>
                        <span className="inline-flex mt-1.5 items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-900/30 dark:border-purple-800 leading-none">
                          {INVOICE_TYPES[p.type as keyof typeof INVOICE_TYPES] ?? p.type}
                        </span>
                      </td>

                      {/* Proveedor */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold ${supplierAvatar}`}>
                            {supplierInitial}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate leading-tight max-w-[160px]">
                              {p.supplier?.name ?? '—'}
                            </p>
                            {p.supplier?.cuit && (
                              <p className="font-mono text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                                {p.supplier.cuit}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Ítems */}
                      <td className="px-4 py-3.5">
                        {itemCount > 0 ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-400 dark:bg-indigo-900/30 dark:border-indigo-800 leading-none">
                              <Package className="w-3 h-3" />
                              {itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}
                            </span>
                            {firstItem && (
                              <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1 truncate max-w-[140px]" title={firstItem.description}>
                                {firstItem.description}
                                {itemCount > 1 && ` +${itemCount - 1} más`}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 dark:text-slate-600">—</span>
                        )}
                      </td>

                      {/* Subtotal · IVA · Total */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] text-gray-400 dark:text-slate-500">Subtotal</span>
                            <span className="text-xs tabular-nums text-gray-600 dark:text-slate-400">
                              {formatCurrency(Number(p.subtotal), p.currency)}
                            </span>
                          </div>
                          {Number(p.taxAmount) > 0 && (
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-[10px] text-gray-400 dark:text-slate-500">IVA</span>
                              <span className="text-xs tabular-nums text-violet-600 dark:text-violet-400">
                                {formatCurrency(Number(p.taxAmount), p.currency)}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-end gap-1.5 pt-0.5 border-t border-gray-100 dark:border-slate-700 mt-0.5">
                            <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                              {formatCurrency(Number(p.total), p.currency)}
                            </span>
                            {p.currency !== 'ARS' && (
                              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-800 px-1 py-0.5 rounded-full">
                                {p.currency}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Almacén */}
                      <td className="px-4 py-3.5 text-center">
                        {p.warehouseId ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full border text-teal-700 bg-teal-50 border-teal-200 dark:text-teal-400 dark:bg-teal-900/30 dark:border-teal-800">
                            <Warehouse className="w-3 h-3" />
                            Stock
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-slate-600 text-xs">—</span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.className}`}>
                            {cfg.label}
                          </span>
                          {!isCancelled && (() => {
                            const pcfg = PAYMENT_STATUS_CFG[p.paymentStatus ?? 'PENDING'];
                            return (
                              <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${pcfg.className}`}>
                                {pcfg.label}
                              </span>
                            );
                          })()}
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          {p.status === 'REGISTERED' && (
                            <button
                              title="Cancelar"
                              onClick={(e) => { e.stopPropagation(); setCancelId(p.id); }}
                              className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-[background-color,color] duration-150"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Footer: pagination ── */}
        {!isLoading && purchases.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-slate-700">
            <span className="text-xs text-gray-400 dark:text-slate-500">
              {purchases.length} de {total} compras
            </span>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </Card>

      <ConfirmDialog
        isOpen={!!cancelId}
        onClose={() => setCancelId(null)}
        onConfirm={handleCancel}
        title="Cancelar compra"
        message="¿Estás seguro de que deseas cancelar esta compra? Los movimientos de stock asociados serán revertidos."
        confirmText="Cancelar compra"
        isLoading={isCanceling}
      />
    </div>
  );
}
