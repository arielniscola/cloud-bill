import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, XCircle, ChevronDown, X, Building2, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Button } from '../../components/ui';
import { PageHeader, DataTable, SearchInput, ConfirmDialog } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { purchasesService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { INVOICE_TYPES, DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { Purchase, PurchaseStatus } from '../../types';

// ── Status config ────────────────────────────────────────────────
const STATUS_CFG: Record<PurchaseStatus, { label: string; className: string }> = {
  REGISTERED: { label: 'Registrada', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  CANCELLED:  { label: 'Cancelada',  className: 'text-red-600    bg-red-50    border-red-200'    },
};

// ── Compact date input ───────────────────────────────────────────
function DateInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-7 px-2 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
    />
  );
}

type StatusTab = 'all' | PurchaseStatus;

export default function PurchasesPage() {
  const navigate = useNavigate();
  const [purchases,   setPurchases]   = useState<Purchase[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [cancelId,    setCancelId]    = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);

  const [statusTab,  setStatusTab]  = useState<StatusTab>('all');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [page,  setPage]  = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const hasFilters = !!(statusTab !== 'all' || dateFrom || dateTo);

  const fetchPurchases = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await purchasesService.getAll({
        page,
        limit,
        ...(statusTab !== 'all' && { status: statusTab }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo   && { dateTo }),
      });
      setPurchases(res.data);
      setTotal(res.total);
    } catch {
      toast.error('Error al cargar compras');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, statusTab, dateFrom, dateTo]);

  useEffect(() => { fetchPurchases(); }, [fetchPurchases]);

  const clearFilters = () => {
    setStatusTab('all'); setDateFrom(''); setDateTo(''); setPage(1);
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

  const TABS: { id: StatusTab; label: string }[] = [
    { id: 'all',        label: 'Todas' },
    { id: 'REGISTERED', label: 'Registradas' },
    { id: 'CANCELLED',  label: 'Canceladas' },
  ];

  const columns: Column<Purchase>[] = [
    {
      key: 'date',
      header: 'Fecha · Nº',
      render: (p) => (
        <div>
          <p className="text-sm text-gray-800">{formatDate(p.date)}</p>
          <p className="font-mono text-[11px] text-gray-400 mt-0.5">{p.number}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (p) => (
        <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border text-purple-700 bg-purple-50 border-purple-200">
          {INVOICE_TYPES[p.type as keyof typeof INVOICE_TYPES] ?? p.type}
        </span>
      ),
    },
    {
      key: 'supplier',
      header: 'Proveedor',
      render: (p) => (
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-3.5 h-3.5 text-orange-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate leading-tight">
              {p.supplier?.name ?? '—'}
            </p>
            {p.supplier?.cuit && (
              <p className="font-mono text-[10px] text-gray-400 mt-0.5">{p.supplier.cuit}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      render: (p) => (
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-900 tabular-nums">
            {formatCurrency(Number(p.total), p.currency)}
          </p>
          {p.currency !== 'ARS' && (
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
              {p.currency}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (p) => {
        const cfg = STATUS_CFG[p.status];
        return (
          <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.className}`}>
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      render: (p) => (
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {p.status === 'REGISTERED' && (
            <button
              title="Cancelar"
              onClick={(e) => { e.stopPropagation(); setCancelId(p.id); }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-[background-color,color] duration-150"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
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

      <Card padding="none">
        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status tabs */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setStatusTab(t.id); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                    statusTab === t.id
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Date range */}
            <div className="flex items-center gap-1">
              <DateInput value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1); }} />
              <span className="text-gray-300 text-xs">→</span>
              <DateInput value={dateTo}   onChange={(v) => { setDateTo(v);   setPage(1); }} />
            </div>

            {/* Clear */}
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
              >
                <X className="w-3 h-3" />
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* ── Table ── */}
        <DataTable
          columns={columns}
          data={purchases}
          isLoading={isLoading}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => navigate(`/purchases/${p.id}`)}
          emptyMessage={
            hasFilters
              ? 'Sin resultados para los filtros aplicados'
              : 'No hay compras registradas'
          }
          pagination={{
            page,
            totalPages: Math.ceil(total / limit),
            limit,
            total,
            onPageChange: setPage,
            onLimitChange: (l) => { setLimit(l); setPage(1); },
          }}
        />

        {/* Empty state */}
        {!isLoading && purchases.length === 0 && !hasFilters && (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <ShoppingCart className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Sin compras</p>
            <p className="text-sm text-gray-400 max-w-xs leading-relaxed mb-5">
              Registrá los comprobantes de tus proveedores para llevar el control de gastos.
            </p>
            <Button onClick={() => navigate('/purchases/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Nueva compra
            </Button>
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
