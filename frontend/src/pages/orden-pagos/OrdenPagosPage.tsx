import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, X, Search, SlidersHorizontal, Rows3, Table2, Download, Truck,
  Clock, Printer, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, Card } from '../../components/ui';
import { PageHeader, Pagination } from '../../components/shared';
import { ordenPagosService, suppliersService } from '../../services';
import { useUrlFilters } from '../../hooks/useUrlFilters';
import { useFiscalModeStore } from '../../stores/fiscalMode.store';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/excelExport';
import { PAYMENT_METHODS, OP_PAYMENT_METHOD_OPTIONS, DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { OrdenPago, OrdenPagoStatus, OrdenPagoSummary } from '../../types/ordenPago.types';
import type { Supplier } from '../../types';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error'> = {
  EMITTED: 'warning',
  PAID: 'success',
  CANCELLED: 'error',
};
const STATUS_LABELS: Record<string, string> = {
  EMITTED: 'Emitida',
  PAID: 'Pagada',
  CANCELLED: 'Anulada',
};

type Tab = 'all' | OrdenPagoStatus;
const TABS: { key: Tab; label: string }[] = [
  { key: 'all',       label: 'Todas' },
  { key: 'EMITTED',   label: 'Emitidas' },
  { key: 'PAID',      label: 'Pagadas' },
  { key: 'CANCELLED', label: 'Anuladas' },
];

// Etiqueta corta del comprobante imputado, para la columna de imputación.
const TYPE_SHORT: Record<string, string> = {
  FACTURA_A: 'FC-A', FACTURA_B: 'FC-B', FACTURA_C: 'FC-C', FACTURA_M: 'FC-M',
  NOTA_DEBITO_A: 'ND-A', NOTA_DEBITO_B: 'ND-B', NOTA_DEBITO_C: 'ND-C',
  NOTA_CREDITO_A: 'NC-A', NOTA_CREDITO_B: 'NC-B', NOTA_CREDITO_C: 'NC-C',
  RECIBO: 'Recibo', OTRO: 'Otro',
};

const SELECT_CLS = 'w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30';

/** Egreso real de caja/banco: `amount` es el bruto imputado y la retención no sale de la caja. */
const netOf = (op: OrdenPago) => Number(op.amount) - Number(op.retentionAmount ?? 0);

/** Comprobantes imputados, ya con etiqueta corta. Vacío = pago a cuenta. */
function imputationLabels(op: OrdenPago): string[] {
  return op.items.map((it) =>
    it.invoice
      ? `${TYPE_SHORT[it.invoice.type] ?? it.invoice.type} ${it.invoice.number}`
      : it.purchase?.number ?? ''
  ).filter(Boolean);
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded" />
        </td>
      ))}
    </tr>
  );
}

export default function OrdenPagosPage() {
  const navigate = useNavigate();
  const fiscalMode = useFiscalModeStore((s) => s.viewMode);

  const { values, setValues, reset } = useUrlFilters({
    tab: 'all', view: 'summary', q: '',
    supplier: '', method: '', currency: '', from: '', to: '', ret: '', acct: '',
    page: '1', limit: String(DEFAULT_PAGE_SIZE),
  });
  const tab   = values.tab as Tab;
  const view  = values.view === 'sheet' ? 'sheet' : 'summary';
  const page  = Number(values.page) || 1;
  const limit = Number(values.limit) || DEFAULT_PAGE_SIZE;

  const [ordenPagos, setOrdenPagos] = useState<OrdenPago[]>([]);
  const [summary, setSummary]       = useState<OrdenPagoSummary | null>(null);
  const [suppliers, setSuppliers]   = useState<Supplier[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // La búsqueda se tipea sin pegarle al backend en cada tecla.
  const [searchDraft, setSearchDraft] = useState(values.q);
  useEffect(() => { setSearchDraft(values.q); }, [values.q]);
  useEffect(() => {
    if (searchDraft === values.q) return;
    const t = setTimeout(() => setValues({ q: searchDraft, page: '1' }), 300);
    return () => clearTimeout(t);
  }, [searchDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Panel de filtros: los que no son búsqueda ni estado.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filtersOpen) return;
    const onClick = (e: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setFiltersOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [filtersOpen]);

  // Selección para acciones en lote (solo planilla)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPaying, setIsPaying] = useState(false);

  const setFilter = (patch: Record<string, string>) => {
    setValues({ ...patch, page: '1' });
    setSelectedIds([]);
  };

  const fetchOrdenPagos = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await ordenPagosService.getAll({
        page, limit,
        supplierId:     values.supplier || undefined,
        status:         tab === 'all' ? undefined : tab,
        paymentMethod:  (values.method as never) || undefined,
        currency:       values.currency || undefined,
        search:         values.q || undefined,
        onlyRetentions: values.ret === '1' || undefined,
        onlyOnAccount:  values.acct === '1' || undefined,
        dateFrom:       values.from || undefined,
        dateTo:         values.to || undefined,
      });
      setOrdenPagos(result.data);
      setSummary(result.summary ?? null);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch {
      toast.error('Error al cargar órdenes de pago');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, tab, values.supplier, values.method, values.currency, values.q, values.ret, values.acct, values.from, values.to]);

  useEffect(() => {
    suppliersService.getAll({ limit: 1000 }).then((r) => setSuppliers(r.data)).catch(() => {});
  }, []);

  useEffect(() => { fetchOrdenPagos(); }, [fetchOrdenPagos, fiscalMode]);

  // ── Filtros activos (chips) ───────────────────────────────────────────────
  const activeFilters = useMemo(() => {
    const out: { key: string; label: string; clear: () => void }[] = [];
    if (values.supplier) {
      const s = suppliers.find((x) => x.id === values.supplier);
      out.push({ key: 'supplier', label: `Proveedor: ${s?.name ?? '—'}`, clear: () => setFilter({ supplier: '' }) });
    }
    if (values.method)   out.push({ key: 'method',   label: `Método: ${PAYMENT_METHODS[values.method as keyof typeof PAYMENT_METHODS] ?? values.method}`, clear: () => setFilter({ method: '' }) });
    if (values.currency) out.push({ key: 'currency', label: `Moneda: ${values.currency}`, clear: () => setFilter({ currency: '' }) });
    if (values.from)     out.push({ key: 'from',     label: `Desde: ${formatDate(values.from)}`, clear: () => setFilter({ from: '' }) });
    if (values.to)       out.push({ key: 'to',       label: `Hasta: ${formatDate(values.to)}`, clear: () => setFilter({ to: '' }) });
    if (values.ret === '1')  out.push({ key: 'ret',  label: 'Con retenciones', clear: () => setFilter({ ret: '' }) });
    if (values.acct === '1') out.push({ key: 'acct', label: 'Pagos a cuenta', clear: () => setFilter({ acct: '' }) });
    return out;
  }, [values, suppliers]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasFilters = activeFilters.length > 0 || !!values.q;

  const clearAllFilters = () => {
    reset(['limit', 'view']);
    setSelectedIds([]);
  };

  // ── Selección y acciones en lote ──────────────────────────────────────────
  const selected = ordenPagos.filter((op) => selectedIds.includes(op.id));
  const selectedTotalArs = selected
    .filter((op) => op.currency === 'ARS')
    .reduce((a, op) => a + Number(op.amount), 0);
  const payableIds = selected.filter((op) => op.status === 'EMITTED').map((op) => op.id);

  const toggleAll = () => {
    setSelectedIds(selectedIds.length === ordenPagos.length ? [] : ordenPagos.map((op) => op.id));
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const paySelected = async () => {
    if (payableIds.length === 0) return;
    setIsPaying(true);
    let ok = 0;
    // Una por una: cada pago abre su propia transacción (caja, cuenta corriente y asiento).
    for (const id of payableIds) {
      try { await ordenPagosService.pay(id); ok++; } catch { /* se informa al final */ }
    }
    setIsPaying(false);
    if (ok > 0) toast.success(`${ok} ${ok === 1 ? 'orden marcada' : 'órdenes marcadas'} como pagada${ok === 1 ? '' : 's'}`);
    if (ok < payableIds.length) toast.error(`${payableIds.length - ok} no se pudieron pagar`);
    setSelectedIds([]);
    fetchOrdenPagos();
  };

  const exportRows = () => {
    const rows = (selected.length > 0 ? selected : ordenPagos).map((op) => ({
      fecha:      formatDate(op.date),
      numero:     op.number,
      proveedor:  op.supplier?.name ?? '',
      cuit:       op.supplier?.cuit ?? '',
      metodo:     PAYMENT_METHODS[op.paymentMethod] ?? op.paymentMethod,
      referencia: op.reference ?? '',
      moneda:     op.currency,
      bruto:      Number(op.amount),
      retencion:  Number(op.retentionAmount ?? 0),
      neto:       netOf(op),
      imputacion: imputationLabels(op).join(' · ') || 'Pago a cuenta',
      estado:     STATUS_LABELS[op.status] ?? op.status,
    }));
    if (rows.length === 0) { toast.error('No hay filas para exportar'); return; }
    exportToExcel(
      `ordenes-de-pago-${new Date().toISOString().slice(0, 10)}`,
      'Órdenes de pago',
      [
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Número', key: 'numero', width: 20 },
        { header: 'Proveedor', key: 'proveedor', width: 30 },
        { header: 'CUIT', key: 'cuit', width: 15 },
        { header: 'Método', key: 'metodo', width: 22 },
        { header: 'Referencia', key: 'referencia', width: 24 },
        { header: 'Moneda', key: 'moneda', width: 9 },
        { header: 'Bruto', key: 'bruto', width: 15, format: 'currency' },
        { header: 'Retención', key: 'retencion', width: 14, format: 'currency' },
        { header: 'Egreso neto', key: 'neto', width: 15, format: 'currency' },
        { header: 'Imputación', key: 'imputacion', width: 40 },
        { header: 'Estado', key: 'estado', width: 12 },
      ],
      rows,
    );
  };

  // Totales de la página, solo ARS: las monedas nunca se netean entre sí.
  const pageArs = ordenPagos.filter((op) => op.currency === 'ARS');
  const pageGross = pageArs.reduce((a, op) => a + Number(op.amount), 0);
  const pageRet   = pageArs.reduce((a, op) => a + Number(op.retentionAmount ?? 0), 0);

  const tabCount = (key: Tab) =>
    summary ? (key === 'all' ? summary.statusCounts.all : summary.statusCounts[key]) : undefined;

  return (
    <div>
      <PageHeader
        title="Órdenes de Pago"
        subtitle="Pagos a proveedores — imputación, retenciones y cheques"
        actions={
          <>
            <Button variant="outline" size="md" onClick={exportRows}>
              <Download className="w-4 h-4 mr-1.5 text-gray-400" />
              {selectedIds.length > 0 ? `Exportar (${selectedIds.length})` : 'Exportar'}
            </Button>
            <Button onClick={() => navigate('/orden-pagos/new')}>
              <Plus className="w-4 h-4 mr-1.5" /> Nueva orden de pago
            </Button>
          </>
        }
      />

      {/* Situación del período filtrado (todo el filtro, no solo la página) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card padding="none" className="px-4 py-3.5">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Pagado en el período</p>
          <p className="mt-1.5 text-[22px] font-bold tracking-tight tabular-nums text-gray-900 dark:text-white">
            {summary ? formatCurrency(summary.paidArs, 'ARS') : '—'}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            {summary ? `${summary.paidCount} ${summary.paidCount === 1 ? 'orden pagada' : 'órdenes pagadas'}` : 'Cargando…'}
          </p>
        </Card>

        <Card padding="none" className={`px-4 py-3.5 ${summary && summary.pendingCount > 0 ? '!border-amber-200 dark:!border-amber-900' : ''}`}>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            <Clock className="w-3 h-3" /> Emitidas sin pagar
          </p>
          <p className="mt-1.5 text-[22px] font-bold tracking-tight tabular-nums text-amber-700 dark:text-amber-400">
            {summary ? formatCurrency(summary.pendingArs, 'ARS') : '—'}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            {summary && summary.pendingCount > 0
              ? `${summary.pendingCount} ${summary.pendingCount === 1 ? 'orden espera' : 'órdenes esperan'} confirmación de pago`
              : 'Sin órdenes pendientes'}
          </p>
        </Card>

        <Card padding="none" className="px-4 py-3.5">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Retenciones practicadas</p>
          <p className="mt-1.5 text-[22px] font-bold tracking-tight tabular-nums text-violet-700 dark:text-violet-400">
            {summary ? formatCurrency(summary.retentionArs, 'ARS') : '—'}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            {summary ? `${summary.retentionCount} ${summary.retentionCount === 1 ? 'orden con retención' : 'órdenes con retención'}` : 'Cargando…'}
          </p>
        </Card>

        <Card padding="none" className="px-4 py-3.5">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Pagos a cuenta</p>
          <p className="mt-1.5 text-[22px] font-bold tracking-tight tabular-nums text-indigo-600 dark:text-indigo-400">
            {summary ? formatCurrency(summary.onAccountArs, 'ARS') : '—'}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            {summary ? `${summary.onAccountCount} sin imputar a facturas` : 'Cargando…'}
          </p>
        </Card>
      </div>

      {/* Estado + vista + búsqueda + filtros */}
      <div className="space-y-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {TABS.map((t) => {
              const on = tab === t.key;
              const count = tabCount(t.key);
              return (
                <button
                  key={t.key}
                  onClick={() => { setValues({ tab: t.key, page: '1' }); setSelectedIds([]); }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    on ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700'
                  }`}
                >
                  {t.label}
                  {count !== undefined && (
                    <span className={`tabular-nums text-[11px] font-semibold px-1.5 rounded-full ${
                      on ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
                    }`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex-1" />

          {/* Conmutador de vista */}
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-800">
            <button
              onClick={() => setValues({ view: 'summary' })}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm transition-colors ${
                view === 'summary'
                  ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 font-semibold shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 font-medium'
              }`}
              title="Vista resumen">
              <Rows3 className="w-3.5 h-3.5" /> Resumen
            </button>
            <button
              onClick={() => setValues({ view: 'sheet' })}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm transition-colors ${
                view === 'sheet'
                  ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 font-semibold shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 font-medium'
              }`}
              title="Vista planilla (densa, con retención y egreso neto)">
              <Table2 className="w-3.5 h-3.5" /> Planilla
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Buscar por N° o proveedor…"
              className="w-60 pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            />
          </div>

          <div className="relative" ref={filtersRef}>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                activeFilters.length > 0
                  ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800'
                  : 'text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'
              }`}>
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filtros
              {activeFilters.length > 0 && (
                <span className="tabular-nums text-[10px] font-bold text-white bg-indigo-600 rounded-full px-1.5 py-px">
                  {activeFilters.length}
                </span>
              )}
            </button>

            {filtersOpen && (
              <div className="absolute right-0 top-full mt-2 z-20 w-80 p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-lg space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Proveedor</label>
                  <select className={SELECT_CLS} value={values.supplier} onChange={(e) => setFilter({ supplier: e.target.value })}>
                    <option value="">Todos los proveedores</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Método de pago</label>
                    <select className={SELECT_CLS} value={values.method} onChange={(e) => setFilter({ method: e.target.value })}>
                      <option value="">Todos</option>
                      {OP_PAYMENT_METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Moneda</label>
                    <select className={SELECT_CLS} value={values.currency} onChange={(e) => setFilter({ currency: e.target.value })}>
                      <option value="">Todas</option>
                      <option value="ARS">ARS</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Desde</label>
                    <input type="date" className={SELECT_CLS} value={values.from} onChange={(e) => setFilter({ from: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Hasta</label>
                    <input type="date" className={SELECT_CLS} value={values.to} onChange={(e) => setFilter({ to: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-slate-700">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={values.ret === '1'}
                      onChange={(e) => setFilter({ ret: e.target.checked ? '1' : '' })}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    Solo con retenciones practicadas
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={values.acct === '1'}
                      onChange={(e) => setFilter({ acct: e.target.checked ? '1' : '' })}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    Solo pagos a cuenta (sin facturas imputadas)
                  </label>
                </div>

                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="w-full text-sm px-3 py-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filtros activos */}
        {hasFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            {values.q && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full pl-2.5 pr-2 py-1">
                Buscar: {values.q}
                <button onClick={() => setValues({ q: '', page: '1' })} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {activeFilters.map((f) => (
              <span key={f.key} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full pl-2.5 pr-2 py-1">
                {f.label}
                <button onClick={f.clear} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            ))}
            <button type="button" onClick={clearAllFilters} className="text-xs text-gray-400 hover:text-red-500 px-1.5 py-1">
              Limpiar todo
            </button>
          </div>
        )}

        {/* Acciones en lote */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800">
            <span className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">
              {selectedIds.length} {selectedIds.length === 1 ? 'orden seleccionada' : 'órdenes seleccionadas'}
            </span>
            <span className="text-sm tabular-nums text-indigo-700 dark:text-indigo-400">
              Total seleccionado {formatCurrency(selectedTotalArs, 'ARS')}
            </span>
            <div className="flex-1" />
            <Button variant="secondary" size="sm" onClick={paySelected} isLoading={isPaying} disabled={payableIds.length === 0}>
              {payableIds.length > 0 ? `Marcar como pagadas (${payableIds.length})` : 'Marcar como pagadas'}
            </Button>
            <Button variant="secondary" size="sm" onClick={exportRows}>Exportar selección</Button>
            <button onClick={() => setSelectedIds([])} className="text-sm text-indigo-600 dark:text-indigo-400">Deseleccionar</button>
          </div>
        )}
      </div>

      {/* Listado */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">

          {view === 'summary' ? (
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700">
                <tr className="text-left text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3 w-44">Orden</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Medio de pago</th>
                  <th className="px-4 py-3">Imputación</th>
                  <th className="px-4 py-3 text-right w-52">Importe</th>
                  <th className="px-4 py-3 w-28">Estado</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                  : ordenPagos.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-14 text-center">
                        <p className="text-sm text-gray-400 dark:text-slate-500">
                          {hasFilters ? 'Ninguna orden coincide con los filtros.' : 'Todavía no cargaste órdenes de pago.'}
                        </p>
                        {hasFilters
                          ? <button onClick={clearAllFilters} className="mt-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">Limpiar filtros</button>
                          : <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Se generan al pagar facturas de compra o como adelanto a un proveedor.</p>}
                      </td>
                    </tr>
                  )
                  : ordenPagos.map((op) => {
                    const imp = imputationLabels(op);
                    const ret = Number(op.retentionAmount ?? 0);
                    return (
                      <tr
                        key={op.id}
                        onClick={() => navigate(`/orden-pagos/${op.id}`)}
                        className={`hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors cursor-pointer ${op.status === 'CANCELLED' ? 'opacity-60' : ''}`}
                      >
                        <td className="px-4 py-3.5 align-top">
                          <span className="font-mono text-[13px] font-semibold text-indigo-600 dark:text-indigo-400">{op.number}</span>
                          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500 tabular-nums">{formatDate(op.date)}</p>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-slate-300">
                            <Truck className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            {op.supplier?.name ?? '—'}
                          </span>
                          {op.supplier?.cuit && (
                            <p className="mt-1 ml-5 text-xs text-gray-400 dark:text-slate-500 tabular-nums">{op.supplier.cuit}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <p className="text-sm text-gray-600 dark:text-slate-400">{PAYMENT_METHODS[op.paymentMethod] ?? op.paymentMethod}</p>
                          {op.reference && <p className="mt-1 font-mono text-[11px] text-gray-400 dark:text-slate-500">{op.reference}</p>}
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          {imp.length === 0 ? (
                            <Badge variant="info">Pago a cuenta</Badge>
                          ) : (
                            <>
                              <p className="font-mono text-xs text-gray-600 dark:text-slate-400">{imp[0]}</p>
                              <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-500">
                                {imp.length > 1 ? `+ ${imp.length - 1} comprobante${imp.length > 2 ? 's' : ''}` : 'Imputación total'}
                              </p>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3.5 align-top text-right">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                            {formatCurrency(Number(op.amount), op.currency)}
                          </p>
                          <p className={`mt-1 text-[11px] tabular-nums ${ret > 0 ? 'text-violet-700 dark:text-violet-400' : 'text-gray-400 dark:text-slate-500'}`}>
                            {ret > 0
                              ? `Ret. ${formatCurrency(ret, op.currency)} · egreso ${formatCurrency(netOf(op), op.currency)}`
                              : 'Sin retenciones'}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <Badge variant={STATUS_VARIANT[op.status] ?? 'default'} dot>
                            {STATUS_LABELS[op.status] ?? op.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/orden-pagos/${op.id}?print=1`); }}
                              title="Imprimir"
                              className="w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-300 hover:text-indigo-600 transition-colors">
                              <Printer className="w-4 h-4" />
                            </button>
                            <span className="w-7 h-7 inline-flex items-center justify-center text-gray-300">
                              <ChevronRight className="w-4 h-4" />
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
                <tr className="text-left text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="pl-4 pr-2 py-2.5 w-9">
                    <input
                      type="checkbox"
                      checked={ordenPagos.length > 0 && selectedIds.length === ordenPagos.length}
                      onChange={toggleAll}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2.5 w-24">Fecha</th>
                  <th className="px-3 py-2.5 w-40">Número</th>
                  <th className="px-3 py-2.5">Proveedor</th>
                  <th className="px-3 py-2.5 w-32">Método</th>
                  <th className="px-3 py-2.5 w-40">Referencia</th>
                  <th className="px-3 py-2.5 w-32 text-right">Bruto</th>
                  <th className="px-3 py-2.5 w-28 text-right">Retención</th>
                  <th className="px-3 py-2.5 w-32 text-right">Egreso neto</th>
                  <th className="px-3 py-2.5 w-28">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={10} />)
                  : ordenPagos.length === 0
                  ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-14 text-center">
                        <p className="text-sm text-gray-400 dark:text-slate-500">
                          {hasFilters ? 'Ninguna orden coincide con los filtros.' : 'Todavía no cargaste órdenes de pago.'}
                        </p>
                        {hasFilters && (
                          <button onClick={clearAllFilters} className="mt-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">Limpiar filtros</button>
                        )}
                      </td>
                    </tr>
                  )
                  : ordenPagos.map((op) => {
                    const ret = Number(op.retentionAmount ?? 0);
                    const isSel = selectedIds.includes(op.id);
                    return (
                      <tr
                        key={op.id}
                        onClick={() => navigate(`/orden-pagos/${op.id}`)}
                        className={`hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors cursor-pointer ${isSel ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : ''} ${op.status === 'CANCELLED' ? 'opacity-60' : ''}`}
                      >
                        <td className="pl-4 pr-2 py-2 w-9" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleOne(op.id)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2 text-[13px] tabular-nums text-gray-600 dark:text-slate-300">{formatDate(op.date)}</td>
                        <td className="px-3 py-2 font-mono text-[13px] font-semibold text-gray-800 dark:text-slate-200">{op.number}</td>
                        <td className="px-3 py-2 text-[13px] text-gray-700 dark:text-slate-300 truncate">{op.supplier?.name ?? '—'}</td>
                        <td className="px-3 py-2 text-[13px] text-gray-600 dark:text-slate-400">{PAYMENT_METHODS[op.paymentMethod] ?? op.paymentMethod}</td>
                        <td className="px-3 py-2 font-mono text-[12px] text-gray-400 dark:text-slate-500 truncate">{op.reference ?? '—'}</td>
                        <td className="px-3 py-2 text-[13px] text-right tabular-nums text-gray-600 dark:text-slate-300">
                          {formatCurrency(Number(op.amount), op.currency)}
                        </td>
                        <td className={`px-3 py-2 text-[13px] text-right tabular-nums ${ret > 0 ? 'text-violet-700 dark:text-violet-400' : 'text-gray-300 dark:text-slate-600'}`}>
                          {ret > 0 ? `-${formatCurrency(ret, op.currency)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-[13px] text-right tabular-nums font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(netOf(op), op.currency)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={STATUS_VARIANT[op.status] ?? 'default'} dot>
                            {STATUS_LABELS[op.status] ?? op.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                }
              </tbody>
              {!isLoading && pageArs.length > 0 && (
                <tfoot className="bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700">
                  <tr className="text-[13px] font-bold text-gray-900 dark:text-white">
                    <td colSpan={6} className="px-3 py-2.5 text-[12px] font-semibold text-gray-500 dark:text-slate-400">
                      Totales de la página (ARS)
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(pageGross, 'ARS')}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-violet-700 dark:text-violet-400">
                      {pageRet > 0 ? `-${formatCurrency(pageRet, 'ARS')}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(pageGross - pageRet, 'ARS')}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>

        {total > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            limit={limit}
            total={total}
            onPageChange={(p) => { setValues({ page: String(p) }); setSelectedIds([]); }}
            onLimitChange={(l) => { setValues({ limit: String(l), page: '1' }); setSelectedIds([]); }}
          />
        )}
      </Card>
    </div>
  );
}
