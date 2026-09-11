import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Edit, Trash2, Truck, Mail, Eye, Upload, SlidersHorizontal, AlertTriangle, CreditCard,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card } from '../../components/ui';
import { PageHeader, SearchInput, ConfirmDialog, DataTable } from '../../components/shared';
import CsvImportModal from '../../components/shared/CsvImportModal';
import type { Column, SortState } from '../../components/shared/DataTable';
import { suppliersService } from '../../services';
import { formatCurrency, formatCuit, formatDate } from '../../utils/formatters';
import { DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { Supplier, SupplierSummary, SupplierSortBy, TaxCondition } from '../../types';

// ── Tax condition badge config ────────────────────────────────────
const TAX_BADGE: Record<TaxCondition, { label: string; className: string }> = {
  RESPONSABLE_INSCRIPTO: { label: 'Resp. Inscripto', className: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
  MONOTRIBUTISTA:        { label: 'Monotributista',  className: 'bg-violet-50 text-violet-700 border border-violet-200' },
  EXENTO:                { label: 'Exento',           className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  CONSUMIDOR_FINAL:      { label: 'Cons. Final',      className: 'bg-gray-100 text-gray-600 border border-gray-200' },
};

// ── Avatar ───────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-orange-100 text-orange-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
  'bg-amber-100 text-amber-700',
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

type FilterTab = 'all' | 'active' | 'inactive';

// ── Preferencias de tabla (columnas opcionales + densidad) ───────
type Prefs = { dense: boolean; hidden: string[] };
const PREFS_KEY = 'suppliers.table.prefs';
const OPTIONAL_COLUMNS: { key: string; label: string }[] = [
  { key: 'cuit',         label: 'CUIT' },
  { key: 'taxCondition', label: 'Condición IVA' },
  { key: 'lastPurchase', label: 'Última compra' },
  { key: 'purchased12m', label: 'Comprado 12 m' },
];

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>;
      return { dense: !!p.dense, hidden: Array.isArray(p.hidden) ? p.hidden : [] };
    }
  } catch { /* preferencia perdida: se usa la de fábrica */ }
  return { dense: false, hidden: [] };
}

export default function SuppliersPage() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [summaries, setSummaries] = useState<Record<string, SupplierSummary>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [hasBalance, setHasBalance] = useState(false);
  const [hasOverdue, setHasOverdue] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [showColumns, setShowColumns] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);

  const isActiveFilter = tab === 'all' ? undefined : tab === 'active';

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* no bloquea */ }
  }, [prefs]);

  useEffect(() => {
    if (!showColumns) return;
    const onDown = (e: MouseEvent) => {
      if (!columnsRef.current?.contains(e.target as Node)) setShowColumns(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showColumns]);

  // Cambiar filtros u orden vuelve a la primera página.
  useEffect(() => { setPage(1); }, [search, tab, hasBalance, hasOverdue, sort.key, sort.dir, limit]);

  const fetchSuppliers = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await suppliersService.getAll({
        page,
        limit,
        search: search || undefined,
        isActive: isActiveFilter,
        hasBalance: hasBalance || undefined,
        hasOverdue: hasOverdue || undefined,
        sortBy: sort.key as SupplierSortBy,
        sortDir: sort.dir,
      });
      setSuppliers(result.data);
      setTotal(result.total ?? result.data.length);

      // Saldo, vencido, última compra y comprado 12 m de la página en un solo pedido.
      const ids = result.data.map((s) => s.id);
      try {
        setSummaries(await suppliersService.getSummaries(ids));
      } catch {
        setSummaries({});   // la tabla sigue siendo usable sin los agregados
      }
    } catch {
      toast.error('Error al cargar proveedores');
    } finally {
      setIsLoading(false);
      setIsFirstLoad(false);
    }
  }, [page, limit, search, isActiveFilter, hasBalance, hasOverdue, sort.key, sort.dir]);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await suppliersService.delete(deleteId);
      toast.success('Proveedor eliminado');
      setDeleteId(null);
      fetchSuppliers();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al eliminar proveedor');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSort = (key: string) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  };

  // Totales de la página que se está mostrando (no del total de proveedores).
  const pageTotals = useMemo(() => {
    let balance = 0, overdue = 0, purchased = 0;
    for (const s of suppliers) {
      const sum = summaries[s.id];
      if (!sum) continue;
      balance += sum.balance.ARS ?? 0;
      overdue += sum.overdueAmount;
      purchased += sum.purchased12m;
    }
    return { balance, overdue, purchased };
  }, [suppliers, summaries]);

  const visible = (key: string) => !prefs.hidden.includes(key);
  const toggleColumn = (key: string) =>
    setPrefs((p) => ({ ...p, hidden: p.hidden.includes(key) ? p.hidden.filter((k) => k !== key) : [...p.hidden, key] }));

  const allColumns: (Column<Supplier> & { optionalKey?: string })[] = [
    {
      key: 'name',
      header: 'Proveedor',
      sortable: true,
      footer: <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Totales de la página</span>,
      render: (s) => (
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold ${avatarColor(s.name)}`}>
            {s.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate leading-tight">{s.name}</p>
            {s.email && (
              <p className="text-xs text-gray-400 truncate leading-none mt-0.5 flex items-center gap-1">
                <Mail className="w-3 h-3 flex-shrink-0" />
                {s.email}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'cuit',
      optionalKey: 'cuit',
      header: 'CUIT',
      render: (s) =>
        s.cuit
          ? <span className="font-mono text-xs bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 px-2 py-0.5 rounded">{formatCuit(s.cuit)}</span>
          : <span className="text-gray-300 dark:text-slate-600">—</span>,
    },
    {
      key: 'taxCondition',
      optionalKey: 'taxCondition',
      header: 'Condición IVA',
      render: (s) => {
        const cfg = TAX_BADGE[s.taxCondition];
        return (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.className}`}>
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: 'balance',
      header: 'Saldo cta. cte.',
      sortable: true,
      className: 'text-right',
      footer: <span className="tabular-nums">{formatCurrency(pageTotals.balance, 'ARS')}</span>,
      render: (s) => {
        const sum = summaries[s.id];
        if (!sum) return <span className="text-gray-300 dark:text-slate-600">—</span>;
        const ars = sum.balance.ARS ?? 0;
        const usd = sum.balance.USD ?? 0;
        if (ars === 0 && usd === 0) return <span className="text-gray-300 dark:text-slate-600">—</span>;
        return (
          <div>
            <p className={`text-sm font-semibold tabular-nums ${ars < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
              {formatCurrency(Math.abs(ars), 'ARS')}
            </p>
            {sum.overdueAmount > 0 ? (
              <p className="text-[11px] font-semibold tabular-nums text-red-700 dark:text-red-400 mt-0.5">
                {formatCurrency(sum.overdueAmount, 'ARS')} vencido
              </p>
            ) : ars < 0 ? (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">saldo a favor</p>
            ) : (
              <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">al día</p>
            )}
            {usd !== 0 && (
              <p className="text-[11px] text-gray-400 dark:text-slate-500 tabular-nums mt-0.5">
                {formatCurrency(usd, 'USD')}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'lastPurchase',
      optionalKey: 'lastPurchase',
      header: 'Última compra',
      sortable: true,
      render: (s) => {
        const d = summaries[s.id]?.lastPurchaseDate;
        return d
          ? <span className="text-sm text-gray-600 dark:text-slate-300">{formatDate(d)}</span>
          : <span className="text-gray-300 dark:text-slate-600">—</span>;
      },
    },
    {
      key: 'purchased12m',
      optionalKey: 'purchased12m',
      header: 'Comprado 12 m',
      sortable: true,
      className: 'text-right',
      footer: <span className="tabular-nums">{formatCurrency(pageTotals.purchased, 'ARS')}</span>,
      render: (s) => {
        const v = summaries[s.id]?.purchased12m ?? 0;
        return v > 0
          ? <span className="text-sm tabular-nums text-gray-600 dark:text-slate-300">{formatCurrency(v, 'ARS')}</span>
          : <span className="text-gray-300 dark:text-slate-600">—</span>;
      },
    },
    {
      key: 'isActive',
      header: 'Estado',
      render: (s) => (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          {s.isActive ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (s) => (
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            title="Cuenta corriente"
            onClick={(e) => { e.stopPropagation(); navigate(`/supplier-accounts/${s.id}`); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-[background-color,color] duration-150"
          >
            <CreditCard className="w-3.5 h-3.5" />
          </button>
          <button
            title="Ver detalle"
            onClick={(e) => { e.stopPropagation(); navigate(`/suppliers/${s.id}`); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-[background-color,color] duration-150"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            title="Editar"
            onClick={(e) => { e.stopPropagation(); navigate(`/suppliers/${s.id}/edit`); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-[background-color,color] duration-150"
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button
            title="Eliminar"
            onClick={(e) => { e.stopPropagation(); setDeleteId(s.id); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-[background-color,color] duration-150"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const columns = allColumns.filter((c) => !c.optionalKey || visible(c.optionalKey));

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all',      label: 'Todos' },
    { id: 'active',   label: 'Activos' },
    { id: 'inactive', label: 'Inactivos' },
  ];

  const noFilters = !search && tab === 'all' && !hasBalance && !hasOverdue;

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle={
          isFirstLoad
            ? undefined
            : `${total} ${total === 1 ? 'proveedor' : 'proveedores'}${
                pageTotals.overdue > 0 ? ` · ${formatCurrency(pageTotals.overdue, 'ARS')} vencido en esta página` : ''
              }`
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Importar CSV
            </Button>
            <Button onClick={() => navigate('/suppliers/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo proveedor
            </Button>
          </div>
        }
      />

      <Card padding="none">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-3">
            {/* Tabs */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                    tab === t.id
                      ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="w-px h-6 bg-gray-200 dark:bg-slate-600" />

            {/* Chips de deuda */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setHasBalance((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  hasBalance
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400'
                    : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:border-gray-300'
                }`}
              >
                Con saldo
              </button>
              <button
                onClick={() => setHasOverdue((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  hasOverdue
                    ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                    : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:border-gray-300'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                Con vencido
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Buscar por nombre, CUIT, email…"
              className="w-72"
            />

            {/* Columnas y densidad */}
            <div className="relative" ref={columnsRef}>
              <button
                title="Columnas y densidad"
                onClick={() => setShowColumns((v) => !v)}
                className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border shadow-sm transition-colors ${
                  showColumns
                    ? 'border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30'
                    : 'border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-700 hover:text-gray-700'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              {showColumns && (
                <div className="absolute right-0 top-11 z-20 w-56 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl p-3">
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Columnas</p>
                  <div className="space-y-1.5 mb-3">
                    {OPTIONAL_COLUMNS.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visible(c.key)}
                          onChange={() => toggleColumn(c.key)}
                          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Densidad</p>
                  <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-lg">
                    {[
                      { id: false, label: 'Normal' },
                      { id: true,  label: 'Compacta' },
                    ].map((d) => (
                      <button
                        key={String(d.id)}
                        onClick={() => setPrefs((p) => ({ ...p, dense: d.id }))}
                        className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                          prefs.dense === d.id
                            ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-slate-400'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          data={suppliers}
          isLoading={isLoading}
          keyExtractor={(s) => s.id}
          onRowClick={(s) => navigate(`/suppliers/${s.id}`)}
          dense={prefs.dense}
          sort={sort}
          onSortChange={handleSort}
          showFooter
          pagination={{
            page,
            totalPages: Math.max(1, Math.ceil(total / limit)),
            limit,
            total,
            onPageChange: setPage,
            onLimitChange: setLimit,
          }}
          emptyMessage={
            search
              ? `Sin resultados para "${search}"`
              : hasOverdue
              ? 'No hay proveedores con facturas vencidas'
              : hasBalance
              ? 'No hay proveedores con saldo pendiente'
              : tab === 'active'
              ? 'No hay proveedores activos'
              : tab === 'inactive'
              ? 'No hay proveedores inactivos'
              : 'No hay proveedores registrados'
          }
        />

        {/* Empty state — no data, no filters */}
        {!isLoading && suppliers.length === 0 && noFilters && (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-4">
              <Truck className="w-7 h-7 text-gray-300 dark:text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">Sin proveedores</p>
            <p className="text-sm text-gray-400 dark:text-slate-500 max-w-xs leading-relaxed mb-5">
              Registrá tus proveedores para asociarlos a compras y llevar un historial de abastecimiento.
            </p>
            <Button onClick={() => navigate('/suppliers/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo proveedor
            </Button>
          </div>
        )}
      </Card>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar proveedor"
        message="¿Estás seguro de que deseas eliminar este proveedor? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />

      {showImport && (
        <CsvImportModal
          entity="suppliers"
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); fetchSuppliers(); }}
        />
      )}
    </div>
  );
}
