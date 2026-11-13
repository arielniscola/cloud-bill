import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { ArrowDown, ArrowUp, ArrowUpDown, DollarSign, Download, History, Percent, Plus, RefreshCw, Search, Upload, X } from 'lucide-react';
import { Button, Modal } from '../../components/ui';
import { PageHeader, Pagination, SupplierSearchSelect } from '../../components/shared';
import { categoriesService, rubrosService } from '../../services';
import priceListService, {
  previewAdjust,
  type ImportMatchRow, type PriceAdjustInput, type PriceListFilters, type PriceListQuery, type PriceListRateMode, type PriceListRow, type PriceListResult,
} from '../../services/price-list.service';
import { useExchangeRate } from '../../hooks/useExchangeRate';
import { useAuthStore } from '../../stores';
import { roleAllowed } from '../../utils/roles';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { PRICE_SOURCE_LABEL, pctChange } from '../../utils/priceHistory';
import * as XLSX from 'xlsx';
import { apiErrorMessage } from '../../utils/apiError';
import { exportToExcel } from '../../utils/excelExport';
import type { Category, PriceChangeSource, Rubro } from '../../types';

type SortKey = NonNullable<PriceListQuery['sort']>;
type ChipKey = 'supplier' | 'category' | 'rubro' | 'usd';

const withTax = (net: number, rate: number) => net * (1 + rate / 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Celda numérica editable con un clic: Enter guarda, Esc cancela, salir del campo guarda. */
function EditableNumber({ value, onCommit, disabled, children }: {
  value: number; onCommit: (v: number) => void | Promise<void>; disabled?: boolean; children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const done = useRef(false);
  if (disabled) return <>{children}</>;
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    if (!save) return;
    const n = Number(text.replace(',', '.'));
    if (text.trim() !== '' && Number.isFinite(n) && n >= 0 && Math.abs(n - value) >= 0.005) onCommit(n);
  };
  if (!editing) {
    return (
      <button type="button" title="Clic para editar"
        onClick={() => { done.current = false; setText(String(value).replace('.', ',')); setEditing(true); }}
        className="-mx-1 cursor-text rounded px-1 text-right hover:bg-indigo-50 hover:ring-1 hover:ring-indigo-200 dark:hover:bg-slate-700">
        {children}
      </button>
    );
  }
  return (
    <input autoFocus inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); }}
      className="h-7 w-24 rounded border border-indigo-400 bg-white px-1.5 text-right text-sm tabular-nums outline-none dark:bg-slate-700 dark:text-white" />
  );
}
/** Margen sobre el precio de venta (mismo criterio que la ficha del producto). */
const marginPct = (r: PriceListRow): number | null => (r.price > 0 ? ((r.price - r.cost) / r.price) * 100 : null);
/** Rojo < 10 %, ámbar < 20 %, verde el resto. */
const marginTone = (m: number | null) =>
  m === null ? { text: 'text-gray-400', bar: 'bg-gray-300', row: '' }
  : m < 10 ? { text: 'text-red-700 dark:text-red-400', bar: 'bg-red-600', row: 'bg-red-50/70 dark:bg-red-900/10' }
  : m < 20 ? { text: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-500', row: '' }
  : { text: 'text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-600', row: '' };
const usd = (v: number) => `US$ ${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money = (v: number) => formatCurrency(v, 'ARS');
const parseRate = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

const USD_LABEL: Record<NonNullable<PriceListFilters['usd']>, string> = {
  ANY: 'Con valores en USD',
  SALE: 'Con venta en USD',
  COST: 'Con costo en USD',
};

const selectClass =
  'w-full rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

/** Rubros en lista plana con sangría para los subrubros. */
function flattenRubros(rubros: Rubro[]): Array<{ id: string; name: string; label: string }> {
  const all: Rubro[] = [];
  const walk = (list: Rubro[]) => list.forEach((r) => { all.push(r); if (r.children?.length) walk(r.children); });
  walk(rubros);
  const byParent = new Map<string | null, Rubro[]>();
  const seen = new Set<string>();
  for (const r of all) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const k = r.parentId ?? null;
    byParent.set(k, [...(byParent.get(k) ?? []), r]);
  }
  const out: Array<{ id: string; name: string; label: string }> = [];
  const add = (parent: string | null, depth: number) => {
    for (const r of (byParent.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({ id: r.id, name: r.name, label: `${'— '.repeat(depth)}${r.name}` });
      add(r.id, depth + 1);
    }
  };
  add(null, 0);
  return out;
}

export default function PriceListPage() {
  const canEdit = roleAllowed(useAuthStore((s) => s.user?.role), ['ADMIN', 'SELLER']);
  const { rate: todayRate, info: rateInfo, refresh: refreshRate } = useExchangeRate();
  const [filters, setFilters] = useState<PriceListFilters>({});
  const [searchText, setSearchText] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(100);
  const [result, setResult] = useState<PriceListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rubros, setRubros] = useState<Array<{ id: string; name: string; label: string }>>([]);
  const [selected, setSelected] = useState<Map<string, PriceListRow>>(new Map());
  const [allMatching, setAllMatching] = useState(false);
  const [openChip, setOpenChip] = useState<ChipKey | null>(null);
  const [barRate, setBarRate] = useState('');
  const [showUpdate, setShowUpdate] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [keepMarginOnEdit, setKeepMarginOnEdit] = useState(false);
  const [exporting, setExporting] = useState(false);
  const chipsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    categoriesService.getAll().then(setCategories).catch(() => {});
    rubrosService.getAll().then((r) => setRubros(flattenRubros(r))).catch(() => {});
  }, []);

  // La cotización de la barra arranca con la del día.
  useEffect(() => {
    if (todayRate && !barRate) setBarRate(todayRate.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }, [todayRate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Búsqueda con debounce.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === (searchText.trim() || undefined) ? f : { ...f, search: searchText.trim() || undefined }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  // Cerrar el desplegable de un chip al hacer click afuera. Con 'click' (no
  // 'mousedown'): la lista del selector de proveedor se dibuja fuera del chip,
  // y así su opción llega a elegirse antes de que esto cierre el panel.
  useEffect(() => {
    if (!openChip) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!target.isConnected) return;
      // La lista del selector de proveedor vive fuera del chip (portal).
      if (target instanceof Element && target.closest('[data-select-dropdown]')) return;
      if (chipsRef.current && !chipsRef.current.contains(target)) setOpenChip(null);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [openChip]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await priceListService.list({ ...filters, page, limit, sort, dir }));
    } catch {
      toast.error('No se pudo cargar la lista de precios');
    } finally {
      setLoading(false);
    }
  }, [filters, page, limit, sort, dir]);

  useEffect(() => { load(); }, [load]);
  // Un filtro nuevo vuelve a la primera página y limpia la selección.
  useEffect(() => { setPage(1); setSelected(new Map()); setAllMatching(false); }, [filters]);

  const setFilter = <K extends keyof PriceListFilters>(key: K, value: PriceListFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
    setOpenChip(null);
  };

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setDir(key === 'name' || key === 'sku' ? 'asc' : 'desc'); }
  };

  const rows = result?.data ?? [];
  const total = result?.total ?? 0;
  const pageAllSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const togglePage = () => {
    setAllMatching(false);
    setSelected((prev) => {
      const next = new Map(prev);
      if (pageAllSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.set(r.id, r));
      return next;
    });
  };
  const toggleRow = (r: PriceListRow) => {
    setAllMatching(false);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(r.id)) next.delete(r.id); else next.set(r.id, r);
      return next;
    });
  };
  const clearSelection = () => { setSelected(new Map()); setAllMatching(false); };
  const selectionCount = allMatching ? total : selected.size;

  // Cuántos de los elegidos tienen valores en USD (los demás quedan igual).
  const selectionMix = useMemo(() => {
    if (allMatching && result) {
      return { sale: result.summary.withSaleUsd, cost: result.summary.withCostUsd, pesos: null as number | null };
    }
    const list = [...selected.values()];
    const sale = list.filter((r) => r.salePriceUSD).length;
    const cost = list.filter((r) => r.costUSD).length;
    const pesos = list.filter((r) => !r.salePriceUSD && !r.costUSD).length;
    return { sale, cost, pesos };
  }, [selected, allMatching, result]);

  // Variación del dólar de hoy contra el de la última actualización de la vista.
  const lastRate = result?.summary.lastRate ?? null;
  const rateDelta = todayRate && lastRate ? ((todayRate - lastRate) / lastRate) * 100 : null;

  const chips: Array<{ key: ChipKey; label: string; value: string | null; clear: () => void }> = [
    { key: 'supplier', label: 'Proveedor', value: filters.supplierId ? supplierName || 'elegido' : null, clear: () => setFilter('supplierId', undefined) },
    { key: 'category', label: 'Categoría', value: filters.categoryId ? categories.find((c) => c.id === filters.categoryId)?.name ?? 'elegida' : null, clear: () => setFilter('categoryId', undefined) },
    { key: 'rubro', label: 'Rubro', value: filters.rubroId ? rubros.find((r) => r.id === filters.rubroId)?.name ?? 'elegido' : null, clear: () => setFilter('rubroId', undefined) },
    { key: 'usd', label: 'Moneda', value: filters.usd ? USD_LABEL[filters.usd] : null, clear: () => setFilter('usd', undefined) },
  ];
  const hasFilters = chips.some((c) => c.value) || !!filters.search || !!filters.includeInactive;

  const exportExcel = async () => {
    setExporting(true);
    try {
      const all: PriceListRow[] = [];
      for (let p = 1; p <= 20; p++) {
        const res = await priceListService.list({ ...filters, page: p, limit: 500, sort, dir });
        all.push(...res.data);
        if (p >= res.totalPages) break;
      }
      exportToExcel(
        `lista-de-precios-${new Date().toISOString().slice(0, 10)}`,
        'Lista de precios',
        [
          { header: 'SKU', key: 'sku', width: 16 },
          { header: 'Nombre', key: 'name', width: 40 },
          { header: 'Descripción', key: 'description', width: 40 },
          { header: 'Proveedor', key: 'supplierName', width: 24 },
          { header: 'Categoría', key: 'categoryName', width: 18 },
          { header: 'IVA %', key: 'taxRate', format: 'number' },
          { header: 'Venta s/IVA', key: 'price', format: 'currency' },
          { header: 'Venta c/IVA', key: 'priceIva', format: 'currency' },
          { header: 'Costo s/IVA', key: 'cost', format: 'currency' },
          { header: 'Costo c/IVA', key: 'costIva', format: 'currency' },
          { header: 'Margen %', key: 'margin', format: 'percent' },
          { header: 'Venta USD', key: 'salePriceUSD', format: 'currency' },
          { header: 'Costo USD', key: 'costUSD', format: 'currency' },
        ],
        all.map((r) => ({
          ...r,
          priceIva: Math.round(withTax(r.price, r.taxRate) * 100) / 100,
          costIva: Math.round(withTax(r.cost, r.taxRate) * 100) / 100,
          margin: Math.round((marginPct(r) ?? 0) * 10) / 10,
        })),
      );
      if (total > all.length) toast(`Se exportaron los primeros ${all.length} de ${total}`);
    } catch {
      toast.error('No se pudo exportar la lista');
    } finally {
      setExporting(false);
    }
  };

  const SortHeader = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <button type="button" onClick={() => toggleSort(k)} className={clsx('inline-flex items-center gap-1 uppercase hover:text-gray-800 dark:hover:text-slate-200', className)}>
      {children}
      {sort === k ? (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );

  const barRateNum = parseRate(barRate);

  /** Guarda una celda editada. Los valores "c/IVA" se pasan a s/IVA con la alícuota del producto. */
  const saveEdit = async (r: PriceListRow, field: 'price' | 'priceIva' | 'cost' | 'costIva' | 'margin', v: number) => {
    const net = (x: number) => round2(x / (1 + r.taxRate / 100));
    try {
      let body: Parameters<typeof priceListService.edit>[0];
      if (field === 'margin') {
        if (v < 0 || v > 95) { toast.error('El margen debe estar entre 0 y 95 %'); return; }
        body = { id: r.id, margin: v };
      } else if (field === 'price' || field === 'priceIva') {
        body = { id: r.id, price: field === 'price' ? v : net(v) };
      } else {
        body = { id: r.id, cost: field === 'cost' ? v : net(v), keepMargin: keepMarginOnEdit };
      }
      const res = await priceListService.edit(body);
      setResult((prev) => prev && { ...prev, data: prev.data.map((x) => (x.id === r.id ? { ...x, price: res.price, cost: res.cost } : x)) });
      load();
    } catch (error) {
      toast.error(apiErrorMessage(error) ?? 'No se pudo guardar el cambio');
    }
  };

  return (
    <div>
      <PageHeader
        title="Lista de precios"
        subtitle={`${total.toLocaleString('es-AR')} producto${total === 1 ? '' : 's'} · precios sin y con IVA, costos y margen`}
        backTo="/products"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-1.5 dark:border-slate-700 dark:bg-slate-800">
              <DollarSign className="h-4 w-4 text-sky-700 dark:text-sky-400" aria-hidden="true" />
              <div>
                <span className="block text-[11px] text-gray-500 dark:text-slate-400">
                  Dólar oficial venta{rateInfo?.fetchedAt ? ` · ${formatDateTime(rateInfo.fetchedAt).split(', ')[1] ?? ''}` : ''}{rateInfo?.stale ? ' · sin conexión' : ''}
                </span>
                <b className="text-base text-gray-900 dark:text-white">{todayRate ? money(todayRate) : '—'}</b>
              </div>
              {rateDelta !== null && Math.abs(rateDelta) >= 0.05 && (
                <span
                  title={`Última actualización con el dólar: $ ${lastRate?.toLocaleString('es-AR')}${result?.summary.lastRateAt ? ` el ${formatDateTime(result.summary.lastRateAt)}` : ''}`}
                  className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold',
                    rateDelta > 0 ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300')}
                >
                  {rateDelta > 0 ? '+' : ''}{rateDelta.toLocaleString('es-AR', { maximumFractionDigits: 1 })} % vs. última actualización
                </span>
              )}
              <button type="button" onClick={() => refreshRate()} aria-label="Volver a consultar el dólar" className="text-gray-400 hover:text-gray-600">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            {canEdit && <Button variant="outline" onClick={() => setShowImport(true)}><Upload className="mr-2 h-4 w-4" />Importar lista de proveedor</Button>}
            <Button variant="outline" onClick={exportExcel} isLoading={exporting}><Download className="mr-2 h-4 w-4" />Exportar Excel</Button>
            <Link to="/products/price-history">
              <Button variant="outline"><History className="mr-2 h-4 w-4" />Historial</Button>
            </Link>
          </div>
        }
      />

      {/* Filtros: búsqueda + chips */}
      <div ref={chipsRef} className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-[16rem] flex-1 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-800">
          <Search className="h-4 w-4 text-gray-400" aria-hidden="true" />
          <span className="sr-only">Buscar</span>
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="SKU, nombre o descripción"
            className="flex-1 border-0 bg-transparent text-sm outline-none dark:text-slate-200"
          />
        </label>

        {chips.map((c) => (
          <div key={c.key} className="relative">
            {c.value ? (
              <span className="flex h-10 items-center gap-1 rounded-lg border border-indigo-300 bg-indigo-50 pl-3 pr-1 text-sm font-semibold text-indigo-800 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200">
                <button type="button" onClick={() => setOpenChip(openChip === c.key ? null : c.key)} className="max-w-[16rem] truncate">
                  {c.label}: {c.value}
                </button>
                <button type="button" onClick={c.clear} aria-label={`Quitar filtro ${c.label}`} className="rounded p-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-800/50">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setOpenChip(openChip === c.key ? null : c.key)}
                aria-expanded={openChip === c.key}
                className="flex h-10 items-center gap-1 rounded-lg border border-dashed border-gray-400 bg-white px-3 text-sm text-gray-700 hover:border-gray-500 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-300"
              >
                <Plus className="h-3.5 w-3.5" /> {c.key === 'usd' ? 'Con valores en USD' : c.label}
              </button>
            )}

            {openChip === c.key && (
              <div className="absolute left-0 top-11 z-30 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                {c.key === 'supplier' && (
                  <SupplierSearchSelect
                    suppliers={[]}
                    value={filters.supplierId ?? ''}
                    onChange={(v, picked) => { setSupplierName(picked?.name ?? ''); setFilter('supplierId', v); }}
                    placeholder="Buscar proveedor…"
                    clearLabel="Todos los proveedores"
                    serverSearch
                    defaultOpen
                  />
                )}
                {c.key === 'category' && (
                  <select aria-label="Categoría" autoFocus value={filters.categoryId ?? ''} onChange={(e) => setFilter('categoryId', e.target.value)} className={selectClass}>
                    <option value="">Todas las categorías</option>
                    {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                  </select>
                )}
                {c.key === 'rubro' && (
                  <select aria-label="Rubro" autoFocus value={filters.rubroId ?? ''} onChange={(e) => setFilter('rubroId', e.target.value)} className={selectClass}>
                    <option value="">Todos los rubros</option>
                    {rubros.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                )}
                {c.key === 'usd' && (
                  <div className="flex flex-col gap-1">
                    {(Object.keys(USD_LABEL) as Array<keyof typeof USD_LABEL>).map((k) => (
                      <button key={k} type="button" onClick={() => setFilter('usd', k)}
                        className={clsx('rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-slate-700',
                          filters.usd === k ? 'font-semibold text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-slate-300')}>
                        {USD_LABEL[k]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <label className="flex h-10 items-center gap-2 px-1 text-sm text-gray-600 dark:text-slate-300">
          <input type="checkbox" checked={!!filters.includeInactive} onChange={(e) => setFilter('includeInactive', e.target.checked)} className="rounded border-gray-300" />
          Inactivos
        </label>
        {hasFilters && (
          <button type="button" onClick={() => { setFilters({}); setSearchText(''); setSupplierName(''); }} className="text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-slate-400">
            Limpiar
          </button>
        )}
        {canEdit && (
          <label className="flex h-10 items-center gap-2 px-1 text-sm text-gray-600 dark:text-slate-300" title="Al editar un costo en la tabla, el precio de venta se mueve en la misma proporción">
            <input type="checkbox" checked={keepMarginOnEdit} onChange={(e) => setKeepMarginOnEdit(e.target.checked)} className="rounded border-gray-300" />
            Al editar el costo, el precio acompaña
          </label>
        )}
        <span className="ml-auto text-sm text-gray-500 dark:text-slate-400">
          {loading ? 'Cargando…' : `${total.toLocaleString('es-AR')} resultado${total === 1 ? '' : 's'}`}
        </span>
      </div>

      {canEdit && pageAllSelected && !allMatching && total > rows.length && (
        <div className="mb-3 rounded-lg bg-indigo-50 px-4 py-2 text-sm text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200">
          Están tildados los {rows.length} productos de esta página.{' '}
          <button type="button" onClick={() => setAllMatching(true)} className="font-semibold underline">
            Seleccionar los {total.toLocaleString('es-AR')} del filtro
          </button>
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="max-h-[calc(100vh-17rem)] overflow-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 dark:bg-slate-800 dark:text-slate-400">
              <tr className="text-right">
                {canEdit && (
                  <th className="w-10 px-3 py-2.5 text-left">
                    <input type="checkbox" aria-label="Seleccionar la página" checked={pageAllSelected} onChange={togglePage} className="rounded border-gray-300" />
                  </th>
                )}
                <th className="px-2 py-2.5 text-left font-semibold"><SortHeader k="sku">SKU</SortHeader></th>
                <th className="px-2 py-2.5 text-left font-semibold"><SortHeader k="name">Producto</SortHeader></th>
                <th colSpan={2} className="border-l border-gray-200 px-2 py-2.5 font-semibold dark:border-slate-700">
                  <SortHeader k="price">Venta</SortHeader> <span className="normal-case font-medium">s/IVA · c/IVA</span>
                </th>
                <th colSpan={2} className="border-l border-gray-200 px-2 py-2.5 font-semibold dark:border-slate-700">
                  <SortHeader k="cost">Costo</SortHeader> <span className="normal-case font-medium">s/IVA · c/IVA</span>
                </th>
                <th className="w-40 border-l border-gray-200 px-3.5 py-2.5 font-semibold dark:border-slate-700"><SortHeader k="margin">Margen</SortHeader></th>
                <th className="border-l border-gray-200 px-3 py-2.5 text-left font-semibold dark:border-slate-700"><SortHeader k="changed">Último cambio</SortHeader></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {loading && rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">Cargando…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9}className="px-4 py-12 text-center text-gray-400">No hay productos con estos filtros.</td></tr>
              ) : rows.map((r) => {
                const m = marginPct(r);
                const tone = marginTone(m);
                const checked = allMatching || selected.has(r.id);
                return (
                  <tr key={r.id} className={clsx('text-right', checked ? 'bg-indigo-50/60 dark:bg-indigo-900/15' : tone.row, !r.isActive && 'opacity-60')}>
                    {canEdit && (
                      <td className="px-3 py-2 text-left">
                        <input type="checkbox" aria-label={`Seleccionar ${r.name}`} checked={checked} onChange={() => toggleRow(r)} disabled={allMatching} className="rounded border-gray-300" />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-2 py-2 text-left font-mono text-xs text-gray-600 dark:text-slate-300">{r.sku}</td>
                    <td className="px-2 py-2 text-left">
                      <Link to={`/products/${r.id}`} className="font-semibold text-gray-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400">{r.name}</Link>
                      {r.description && <span className="block max-w-md truncate text-xs text-gray-500 dark:text-slate-400" title={r.description}>{r.description}</span>}
                      {!r.isActive && <span className="text-xs text-gray-400"> · inactivo</span>}
                    </td>
                    <td className="whitespace-nowrap border-l border-gray-100 px-2 py-2 tabular-nums dark:border-slate-700/60">
                      <EditableNumber value={r.price} disabled={!canEdit} onCommit={(v) => saveEdit(r, 'price', v)}>
                        <b className="text-gray-900 dark:text-white">{money(r.price)}</b>
                      </EditableNumber>
                      {r.salePriceUSD ? <span className="block text-[11px] text-sky-700 dark:text-sky-400">{usd(r.salePriceUSD)}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums text-gray-700 dark:text-slate-300">
                      <EditableNumber value={round2(withTax(r.price, r.taxRate))} disabled={!canEdit} onCommit={(v) => saveEdit(r, 'priceIva', v)}>
                        {money(withTax(r.price, r.taxRate))}
                      </EditableNumber>
                      {r.taxRate !== 21 && <span className="block text-[11px] text-gray-400">IVA {r.taxRate.toLocaleString('es-AR')} %</span>}
                    </td>
                    <td className="whitespace-nowrap border-l border-gray-100 px-2 py-2 tabular-nums text-gray-700 dark:border-slate-700/60 dark:text-slate-300">
                      <EditableNumber value={r.cost} disabled={!canEdit} onCommit={(v) => saveEdit(r, 'cost', v)}>
                        {money(r.cost)}
                      </EditableNumber>
                      {r.costUSD ? <span className="block text-[11px] text-sky-700 dark:text-sky-400">{usd(r.costUSD)}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums text-gray-700 dark:text-slate-300">
                      <EditableNumber value={round2(withTax(r.cost, r.taxRate))} disabled={!canEdit} onCommit={(v) => saveEdit(r, 'costIva', v)}>
                        {money(withTax(r.cost, r.taxRate))}
                      </EditableNumber>
                    </td>
                    <td className="border-l border-gray-100 px-3.5 py-2 dark:border-slate-700/60">
                      <div className="flex items-center justify-end gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-600" aria-hidden="true">
                          <span className={clsx('block h-1.5', tone.bar)} style={{ width: `${Math.max(0, Math.min(100, (m ?? 0) * 2.5))}%` }} />
                        </span>
                        <EditableNumber value={m === null ? 0 : Math.round(m * 10) / 10} disabled={!canEdit || !(r.cost > 0)} onCommit={(v) => saveEdit(r, 'margin', v)}>
                          <b className={clsx('inline-block w-14 tabular-nums', tone.text)}>
                            {m === null ? '—' : `${m.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`}
                          </b>
                        </EditableNumber>
                      </div>
                    </td>
                    <td className="whitespace-nowrap border-l border-gray-100 px-3 py-2 text-xs dark:border-slate-700/60"
                      title={r.lastChangeSource ? PRICE_SOURCE_LABEL[r.lastChangeSource as PriceChangeSource] ?? r.lastChangeSource : undefined}>
                      {r.lastChangeAt ? (
                        <>
                          <span className="block text-gray-700 dark:text-slate-300">{formatDate(r.lastChangeAt)}</span>
                          {[['Venta', pctChange(r.lastOldPrice, r.lastNewPrice)], ['Costo', pctChange(r.lastOldCost, r.lastNewCost)]].map(([l, c]) =>
                            c === null ? null : (
                              <span key={l as string} className={clsx('block tabular-nums', (c as number) > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-sky-700 dark:text-sky-400')}>
                                {l as string} {(c as number) > 0 ? '+' : ''}{(c as number).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %
                              </span>
                            ))}
                        </>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {result && total > 0 && (
          <div className="border-t border-gray-100 px-4 py-3 dark:border-slate-700">
            <Pagination page={page} totalPages={result.totalPages} limit={limit} total={total}
              onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1); }} />
          </div>
        )}
      </div>

      {/* Barra de la selección */}
      {canEdit && selectionCount > 0 && (
        <div className="sticky bottom-4 z-30 mt-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-gray-900 px-5 py-3 text-white shadow-2xl dark:bg-slate-950">
            <span className="text-sm">
              <b>{selectionCount.toLocaleString('es-AR')}</b> seleccionado{selectionCount === 1 ? '' : 's'}
              {!allMatching && total > selected.size && (
                <> · <button type="button" onClick={() => setAllMatching(true)} className="text-indigo-300 underline hover:text-indigo-200">seleccionar los {total.toLocaleString('es-AR')} del filtro</button></>
              )}
              {' · '}<button type="button" onClick={clearSelection} className="text-gray-400 hover:text-white">quitar</button>
            </span>
            <span className="text-xs text-gray-300">
              {[
                selectionMix.sale ? `${selectionMix.sale} con venta en USD` : null,
                selectionMix.cost ? `${selectionMix.cost} con costo en USD` : null,
                selectionMix.pesos ? `${selectionMix.pesos} en pesos (quedan igual)` : null,
              ].filter(Boolean).join(' · ') || 'Ninguno tiene valores en USD'}
            </span>
            <span className="flex-1" />
            <label className="flex items-center gap-2 text-sm text-gray-300">
              Cotización
              <input
                inputMode="decimal"
                value={barRate}
                onChange={(e) => setBarRate(e.target.value)}
                className="h-9 w-28 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-right font-semibold text-white outline-none focus:border-indigo-400"
              />
            </label>
            <button
              type="button"
              onClick={() => setShowAdjust(true)}
              className="flex h-11 items-center gap-2 rounded-xl border border-gray-600 px-4 text-sm font-semibold hover:bg-gray-800"
            >
              <Percent className="h-4 w-4" /> Ajustar en pesos
            </button>
            <button
              type="button"
              onClick={() => setShowUpdate(true)}
              disabled={!(barRateNum > 0)}
              className="flex h-11 items-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-50"
            >
              <DollarSign className="h-4 w-4" /> Actualizar precios con el dólar
            </button>
          </div>
        </div>
      )}

      <ImportListModal isOpen={showImport} onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); load(); }} />

      <AdjustModal
        isOpen={showAdjust}
        onClose={() => setShowAdjust(false)}
        selectedRows={allMatching ? null : [...selected.values()]}
        filters={filters}
        total={selectionCount}
        onDone={() => { setShowAdjust(false); clearSelection(); load(); }}
      />

      <UpdateFromRateModal
        isOpen={showUpdate}
        onClose={() => setShowUpdate(false)}
        initialRate={barRateNum > 0 ? barRateNum : null}
        selectedRows={allMatching ? null : [...selected.values()]}
        filters={filters}
        summary={allMatching ? result?.summary ?? null : null}
        onDone={() => { setShowUpdate(false); clearSelection(); load(); }}
      />
    </div>
  );
}

/* ── Modal: importar la lista de precios de un proveedor ───────────────── */
const normHeader = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const CODE_ALIASES = ['codigo', 'cod', 'sku', 'codart', 'codigoarticulo', 'codigodearticulo', 'articulo', 'ean', 'codigobarras', 'codigodebarras', 'codprov'];
const COST_ALIASES = ['costo', 'preciolista', 'precio', 'preciocompra', 'costoars', 'pcosto', 'lista', 'precionetounitario', 'preciounitario'];

/** "1.234,56", "$ 1234.5", 12.5 → número; null si no se entiende. */
function parseCellNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(','); const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lastComma >= 0) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function ImportListModal({ isOpen, onClose, onDone }: { isOpen: boolean; onClose: () => void; onDone: () => void }) {
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<unknown[][]>([]);
  const [codeCol, setCodeCol] = useState(-1);
  const [costCol, setCostCol] = useState(-1);
  const [matches, setMatches] = useState<ImportMatchRow[] | null>(null);
  const [matching, setMatching] = useState(false);
  const [costIncludesTax, setCostIncludesTax] = useState(false);
  const [keepMargin, setKeepMargin] = useState(true);
  const [rounding, setRounding] = useState<PriceAdjustInput['rounding']>(0);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) return;
    setFileName(''); setHeaders([]); setData([]); setCodeCol(-1); setCostCol(-1); setMatches(null);
    setCostIncludesTax(false); setKeepMargin(true); setRounding(0); setExcluded(new Set());
  }, [isOpen]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const name = wb.SheetNames.find((n) => wb.Sheets[n]?.['!ref']);
      if (!name) { toast.error('El archivo no tiene datos'); return; }
      const all = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' })
        .filter((row) => row.some((c) => String(c).trim() !== ''));
      if (all.length < 2) { toast.error('El archivo no tiene filas de datos'); return; }
      const hdr = all[0].map((h) => String(h ?? '').trim());
      setFileName(file.name);
      setHeaders(hdr);
      setData(all.slice(1));
      setCodeCol(hdr.findIndex((h) => CODE_ALIASES.includes(normHeader(h))));
      setCostCol(hdr.findIndex((h) => COST_ALIASES.includes(normHeader(h))));
      setMatches(null);
      setExcluded(new Set());
    } catch {
      toast.error('No se pudo leer el archivo (usá .xlsx, .xls o .csv)');
    }
  };

  // Cruza los códigos del archivo con SKU / código de barras.
  useEffect(() => {
    if (codeCol < 0 || data.length === 0) { setMatches(null); return; }
    const codes = [...new Set(data.map((r) => String(r[codeCol] ?? '').trim()).filter(Boolean))];
    if (codes.length === 0) { setMatches([]); return; }
    let cancelled = false;
    setMatching(true);
    priceListService.importMatch(codes)
      .then((m) => { if (!cancelled) setMatches(m); })
      .catch(() => { if (!cancelled) toast.error('No se pudo cruzar la lista con tus productos'); })
      .finally(() => { if (!cancelled) setMatching(false); });
    return () => { cancelled = true; };
  }, [codeCol, data]);

  const analysis = useMemo(() => {
    if (!matches || codeCol < 0 || costCol < 0) return null;
    const byCode = new Map<string, ImportMatchRow>();
    matches.forEach((p) => { byCode.set(p.sku.toLowerCase(), p); if (p.barcode) byCode.set(p.barcode.toLowerCase(), p); });
    const perProduct = new Map<string, { p: ImportMatchRow; fileCost: number }>(); // si el código se repite, gana la última fila
    let unmatched = 0; let noCost = 0;
    for (const row of data) {
      const code = String(row[codeCol] ?? '').trim().toLowerCase();
      if (!code) continue;
      const p = byCode.get(code);
      if (!p) { unmatched++; continue; }
      const fileCost = parseCellNumber(row[costCol]);
      if (fileCost === null || fileCost < 0) { noCost++; continue; }
      perProduct.set(p.id, { p, fileCost });
    }
    const rows = [...perProduct.values()].map(({ p, fileCost }) => {
      const newCost = round2(costIncludesTax ? fileCost / (1 + p.taxRate / 100) : fileCost);
      const raw = keepMargin && p.cost > 0 ? (p.price * newCost) / p.cost : p.price;
      const newPrice = rounding > 0 ? Math.round(raw / rounding) * rounding : round2(raw);
      return { p, fileCost, newCost, newPrice, changed: Math.abs(newCost - p.cost) >= 0.005 || Math.abs(newPrice - p.price) >= 0.005 };
    });
    return { rows: rows.filter((r) => r.changed), same: rows.filter((r) => !r.changed).length, unmatched, noCost };
  }, [matches, data, codeCol, costCol, costIncludesTax, keepMargin, rounding]);

  const toApply = (analysis?.rows ?? []).filter((r) => !excluded.has(r.p.id));
  const marginOf = (price: number, cost: number) => (price > 0 ? ((price - cost) / price) * 100 : null);
  const pctTxt = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);
  const delta = (a: number, b: number) => (a > 0 ? ((b - a) / a) * 100 : null);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await priceListService.importApply({
        items: toApply.map((r) => ({ id: r.p.id, cost: r.fileCost })),
        costIncludesTax, keepMargin, rounding,
      });
      toast.success(`${res.updated} producto${res.updated === 1 ? '' : 's'} actualizado${res.updated === 1 ? '' : 's'} desde la lista`, { duration: 6000 });
      onDone();
    } catch (error) {
      toast.error(apiErrorMessage(error) ?? 'No se pudo aplicar la lista');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Importar lista de precios de un proveedor" size="xl">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">Archivo (Excel o CSV)</label>
          <input type="file" accept=".xlsx,.xls,.xlsm,.csv" onChange={(e) => onFile(e.target.files?.[0])}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 dark:text-slate-300" />
          <p className="mt-1 text-xs text-gray-400">La primera fila debe tener los encabezados. Se cruza por SKU o código de barras de tus productos.</p>
        </div>

        {headers.length > 0 && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              {([['Columna del código', codeCol, setCodeCol], ['Columna del costo', costCol, setCostCol]] as const).map(([label, val, set]) => (
                <div key={label}>
                  <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">{label}</span>
                  <select value={val} onChange={(e) => set(Number(e.target.value))} className={clsx(selectClass, 'w-56')}>
                    <option value={-1}>Elegí una columna…</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">Redondear precio</span>
                <select value={rounding} onChange={(e) => setRounding(Number(e.target.value) as PriceAdjustInput['rounding'])} className={clsx(selectClass, 'w-36')}>
                  <option value={0}>Sin redondeo</option><option value={1}>Al peso</option><option value={10}>A $10</option><option value={50}>A $50</option><option value={100}>A $100</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-700 dark:text-slate-200">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={costIncludesTax} onChange={(e) => setCostIncludesTax(e.target.checked)} className="rounded border-gray-300" />
                Los costos del archivo ya incluyen IVA
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={keepMargin} onChange={(e) => setKeepMargin(e.target.checked)} className="rounded border-gray-300" />
                El precio de venta acompaña (mantiene el margen)
              </label>
            </div>
          </>
        )}

        {matching && <p className="text-sm text-gray-500">Cruzando con tus productos…</p>}

        {analysis && (
          <>
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-slate-700/50 dark:text-slate-200">
              <strong>{analysis.rows.length}</strong> producto{analysis.rows.length === 1 ? '' : 's'} con cambios
              {analysis.same > 0 && <> · {analysis.same} sin cambios</>}
              {analysis.unmatched > 0 && <> · <span className="text-amber-700 dark:text-amber-400">{analysis.unmatched} fila{analysis.unmatched === 1 ? '' : 's'} del archivo sin producto en el sistema</span></>}
              {analysis.noCost > 0 && <> · {analysis.noCost} sin costo válido</>}
            </p>
            {analysis.rows.length > 0 && (
              <div className="max-h-72 overflow-auto rounded-lg border border-gray-200 dark:border-slate-700">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-gray-400 dark:bg-slate-800">
                    <tr>
                      <th className="w-8 px-3 py-1.5" />
                      <th className="px-3 py-1.5 text-left font-semibold">Producto</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Costo s/IVA</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Venta s/IVA</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Margen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {analysis.rows.slice(0, 200).map((r) => {
                      const off = excluded.has(r.p.id);
                      const cd = delta(r.p.cost, r.newCost);
                      return (
                        <tr key={r.p.id} className={off ? 'opacity-40' : ''}>
                          <td className="px-3 py-1.5">
                            <input type="checkbox" checked={!off} aria-label={`Aplicar ${r.p.name}`}
                              onChange={() => setExcluded((prev) => { const n = new Set(prev); if (n.has(r.p.id)) n.delete(r.p.id); else n.add(r.p.id); return n; })} />
                          </td>
                          <td className="px-3 py-1.5 text-gray-700 dark:text-slate-200">
                            {r.p.name}<span className="ml-1 font-mono text-gray-400">{r.p.sku}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                            <span className="text-gray-400 line-through">{money(r.p.cost)}</span>{' '}
                            <b className="text-gray-900 dark:text-white">{money(r.newCost)}</b>
                            {cd !== null && <span className={clsx('ml-1', cd > 0 ? 'text-amber-700' : 'text-sky-700')}>{cd > 0 ? '+' : ''}{cd.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %</span>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                            <span className="text-gray-400 line-through">{money(r.p.price)}</span>{' '}
                            <b className="text-gray-900 dark:text-white">{money(r.newPrice)}</b>
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                            <span className="text-gray-400">{pctTxt(marginOf(r.p.price, r.p.cost))}</span> → <b>{pctTxt(marginOf(r.newPrice, r.newCost))}</b>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {analysis.rows.length > 200 && <p className="px-3 py-2 text-xs text-gray-400">Se muestran 200 de {analysis.rows.length}; se aplican todos los tildados.</p>}
              </div>
            )}
          </>
        )}

        <p className="text-xs text-gray-400">Queda en el historial de precios y se puede deshacer desde ahí.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} isLoading={saving} disabled={toApply.length === 0}>Aplicar a {toApply.length} producto{toApply.length === 1 ? '' : 's'}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Modal: ajustar precios/costos en pesos (sin cotización) ───────────── */
type AdjustTarget = 'PRICE' | 'COST' | 'MARGIN';

function AdjustModal({
  isOpen, onClose, selectedRows, filters, total, onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** null = todos los del filtro. */
  selectedRows: PriceListRow[] | null;
  filters: PriceListFilters;
  total: number;
  onDone: () => void;
}) {
  const [target, setTarget] = useState<AdjustTarget>('PRICE');
  const [type, setType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [valueText, setValueText] = useState('');
  const [keepMargin, setKeepMargin] = useState(true);
  const [rounding, setRounding] = useState<PriceAdjustInput['rounding']>(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTarget('PRICE'); setType('PERCENT'); setValueText(''); setKeepMargin(true); setRounding(0);
  }, [isOpen]);

  const value = Number(valueText.replace(',', '.'));
  const valueOk = valueText.trim() !== '' && Number.isFinite(value) &&
    (target === 'MARGIN' ? value >= 0 && value <= 95 : type === 'PERCENT' ? value > -100 : true);
  const input: PriceAdjustInput = { target, type, value, keepMargin, rounding };

  const previews = useMemo(() => {
    if (!selectedRows || !valueOk) return [];
    return selectedRows.map((r) => ({ r, p: previewAdjust(r, input) }));
  }, [selectedRows, valueOk, target, type, value, keepMargin, rounding]); // eslint-disable-line react-hooks/exhaustive-deps
  const affected = selectedRows ? previews.filter((x) => x.p).length : total;
  const showCost = target === 'COST';
  const marginOf = (price: number, cost: number) => (price > 0 ? ((price - cost) / price) * 100 : null);
  const pct = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);

  const submit = async () => {
    if (!valueOk) { toast.error('Ingresá un valor válido'); return; }
    setSaving(true);
    try {
      const res = await priceListService.adjust({
        ...input,
        ...(selectedRows ? { ids: selectedRows.map((r) => r.id) } : { filter: filters }),
      });
      toast.success(
        `${res.updated} producto${res.updated === 1 ? '' : 's'} actualizado${res.updated === 1 ? '' : 's'}` +
        (res.skipped ? ` · ${res.skipped} sin costo, sin cambios` : ''),
        { duration: 6000 },
      );
      onDone();
    } catch (error) {
      toast.error(apiErrorMessage(error) ?? 'No se pudieron ajustar los precios');
    } finally {
      setSaving(false);
    }
  };

  const options: Array<{ v: AdjustTarget; t: string; d: string }> = [
    { v: 'PRICE', t: 'Precio de venta', d: 'Sube o baja el precio de venta. El costo no cambia, así que el margen se mueve.' },
    { v: 'COST', t: 'Costo', d: 'Sube o baja el costo. Podés hacer que el precio de venta acompañe y el margen se mantenga.' },
    { v: 'MARGIN', t: 'Fijar margen', d: 'Recalcula el precio de venta desde el costo para que todos queden con el mismo margen.' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajustar precios en pesos" size="lg">
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium text-gray-700 dark:text-slate-300">Qué se ajusta</legend>
          {options.map((o) => (
            <label key={o.v} className={clsx('flex cursor-pointer gap-3 rounded-lg border p-3',
              target === o.v ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-slate-600')}>
              <input type="radio" name="adj-target" checked={target === o.v} onChange={() => { setTarget(o.v); setValueText(''); }} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-gray-900 dark:text-white">{o.t}</span>
                <span className="block text-xs text-gray-500 dark:text-slate-400">{o.d}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-end gap-3">
          {target !== 'MARGIN' && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">Cómo</span>
              <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 dark:border-slate-600">
                {([['PERCENT', 'Porcentaje %'], ['AMOUNT', 'Monto $']] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setType(k)}
                    className={clsx('px-3 py-2 text-sm', type === k ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 dark:bg-slate-700 dark:text-slate-200')}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label htmlFor="adj-value" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
              {target === 'MARGIN' ? 'Margen objetivo (%)' : type === 'PERCENT' ? 'Variación (%)' : 'Monto a sumar ($)'}
            </label>
            <input id="adj-value" inputMode="decimal" autoFocus value={valueText} onChange={(e) => setValueText(e.target.value)}
              placeholder={target === 'MARGIN' ? '30' : '10'}
              className={clsx(selectClass, 'w-36 text-right font-semibold tabular-nums')} />
          </div>
          <div>
            <label htmlFor="adj-round" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">Redondear precio</label>
            <select id="adj-round" value={rounding} onChange={(e) => setRounding(Number(e.target.value) as PriceAdjustInput['rounding'])} className={clsx(selectClass, 'w-40')}>
              <option value={0}>Sin redondeo</option>
              <option value={1}>Al peso</option>
              <option value={10}>A $10</option>
              <option value={50}>A $50</option>
              <option value={100}>A $100</option>
            </select>
          </div>
        </div>
        {target !== 'MARGIN' && <p className="-mt-2 text-xs text-gray-400">Usá un número negativo para bajar (ej. -5).</p>}

        {target === 'COST' && (
          <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700 dark:text-slate-200">
            <input type="checkbox" checked={keepMargin} onChange={(e) => setKeepMargin(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
            <span>
              Que el precio de venta acompañe (mantiene el margen)
              <span className="block text-xs text-gray-500 dark:text-slate-400">Si lo destildás, sube solo el costo y el margen baja.</span>
            </span>
          </label>
        )}

        <p className={clsx('rounded-lg px-3 py-2 text-sm',
          affected > 0 || !valueOk ? 'bg-gray-50 text-gray-700 dark:bg-slate-700/50 dark:text-slate-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300')}>
          Se ajustan <strong>{affected.toLocaleString('es-AR')}</strong> de {total.toLocaleString('es-AR')} producto{total === 1 ? '' : 's'}.
          {selectedRows && valueOk && affected < total && ' Los demás no tienen costo cargado y quedan como están.'}
          {!selectedRows && target === 'MARGIN' && ' Los que no tengan costo cargado quedan como están.'}
        </p>

        {selectedRows && valueOk && affected > 0 && (
          <div className="max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-slate-700">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 text-gray-400 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-1.5 text-left font-semibold">Producto</th>
                  <th className="px-3 py-1.5 text-right font-semibold">Venta s/IVA</th>
                  {showCost && <th className="px-3 py-1.5 text-right font-semibold">Costo s/IVA</th>}
                  <th className="px-3 py-1.5 text-right font-semibold">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {previews.filter((x) => x.p).slice(0, 50).map(({ r, p }) => (
                  <tr key={r.id}>
                    <td className="px-3 py-1.5 text-gray-700 dark:text-slate-200">{r.name}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                      <span className="text-gray-400 line-through">{money(r.price)}</span>{' '}
                      <span className="font-semibold text-gray-900 dark:text-white">{money(p!.price)}</span>
                    </td>
                    {showCost && (
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                        <span className="text-gray-400 line-through">{money(r.cost)}</span>{' '}
                        <span className="font-semibold text-gray-900 dark:text-white">{money(p!.cost)}</span>
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                      <span className="text-gray-400">{pct(marginOf(r.price, r.cost))}</span> → <b>{pct(marginOf(p!.price, p!.cost))}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-gray-400">
          Queda en el historial de precios y se puede deshacer desde ahí. Si el producto tiene costo/venta en USD, ese valor no se toca.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} isLoading={saving} disabled={!valueOk || affected === 0}>Aplicar a {affected.toLocaleString('es-AR')} producto{affected === 1 ? '' : 's'}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Modal: actualizar precios con la cotización del día ──────────────── */
function UpdateFromRateModal({
  isOpen, onClose, initialRate, selectedRows, filters, summary, onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Cotización cargada en la barra de la selección. */
  initialRate: number | null;
  /** null = todos los del filtro (se usan `filters` + `summary`). */
  selectedRows: PriceListRow[] | null;
  filters: PriceListFilters;
  summary: PriceListResult['summary'] | null;
  onDone: () => void;
}) {
  const { rate: todayRate, info, refresh } = useExchangeRate();
  const [mode, setMode] = useState<PriceListRateMode>('SALE_USD');
  const [rateText, setRateText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const start = initialRate ?? todayRate;
    setRateText(start ? String(start) : '');
    if (selectedRows) {
      const sale = selectedRows.filter((r) => r.salePriceUSD).length;
      const cost = selectedRows.filter((r) => r.costUSD).length;
      setMode(sale === 0 && cost > 0 ? 'COST_USD' : 'SALE_USD');
    } else if (summary) {
      setMode(summary.withSaleUsd === 0 && summary.withCostUsd > 0 ? 'COST_USD' : 'SALE_USD');
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const rate = Number(rateText.replace(',', '.'));
  const rateOk = Number.isFinite(rate) && rate > 0;
  const total = selectedRows ? selectedRows.length : summary?.total ?? 0;
  const eligibleRows = useMemo(
    () => (selectedRows ?? []).filter((r) => (mode === 'SALE_USD' ? r.salePriceUSD : r.costUSD)),
    [selectedRows, mode],
  );
  const eligible = selectedRows ? eligibleRows.length : mode === 'SALE_USD' ? summary?.withSaleUsd ?? 0 : summary?.withCostUsd ?? 0;

  const preview = (r: PriceListRow): { price: number; cost: number } => {
    if (mode === 'SALE_USD') return { price: Math.round((r.salePriceUSD ?? 0) * rate * 100) / 100, cost: r.cost };
    const cost = Math.round((r.costUSD ?? 0) * rate * 100) / 100;
    return { cost, price: r.cost > 0 ? Math.round((r.price * cost / r.cost) * 100) / 100 : r.price };
  };

  const submit = async () => {
    if (!rateOk) { toast.error('Ingresá una cotización válida'); return; }
    setSaving(true);
    try {
      const res = await priceListService.updateFromRate({
        mode, rate,
        ...(selectedRows ? { ids: selectedRows.map((r) => r.id) } : { filter: filters }),
      });
      toast.success(
        `${res.updated} precio${res.updated === 1 ? '' : 's'} actualizado${res.updated === 1 ? '' : 's'} con dólar $${res.rate.toLocaleString('es-AR')}` +
        (res.skipped ? ` · ${res.skipped} sin valor en USD, sin cambios` : ''),
        { duration: 6000 },
      );
      onDone();
    } catch (error) {
      toast.error(apiErrorMessage(error) ?? 'No se pudieron actualizar los precios');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Actualizar precios con el dólar del día" size="lg">
      <div className="space-y-4">
        <div>
          <label htmlFor="pl-rate" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">Cotización (pesos por dólar)</label>
          <div className="flex items-center gap-2">
            <input id="pl-rate" inputMode="decimal" value={rateText} onChange={(e) => setRateText(e.target.value)}
              className={clsx(selectClass, 'w-40 text-right font-semibold tabular-nums')} />
            {todayRate && Number(rateText) !== todayRate && (
              <button type="button" onClick={() => setRateText(String(todayRate))} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                Usar dólar del día (${todayRate.toLocaleString('es-AR')})
              </button>
            )}
            <button type="button" onClick={() => refresh()} title="Volver a consultar la cotización" className="text-gray-400 hover:text-gray-600">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          {info && <p className="mt-1 text-xs text-gray-400">{info.source}{info.stale ? ' · última conocida (la fuente no respondió)' : ''}</p>}
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium text-gray-700 dark:text-slate-300">Qué se actualiza</legend>
          {([
            { v: 'SALE_USD', t: 'Precio de venta = precio de venta en USD × cotización', d: 'Para productos con precio de venta en dólares. El costo no cambia.' },
            { v: 'COST_USD', t: 'Costo = costo en USD × cotización, manteniendo el margen', d: 'Para productos con costo en dólares. El precio de venta sube o baja en la misma proporción que el costo.' },
          ] as const).map((o) => (
            <label key={o.v} className={clsx('flex cursor-pointer gap-3 rounded-lg border p-3',
              mode === o.v ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-slate-600')}>
              <input type="radio" name="pl-mode" checked={mode === o.v} onChange={() => setMode(o.v)} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-gray-900 dark:text-white">{o.t}</span>
                <span className="block text-xs text-gray-500 dark:text-slate-400">{o.d}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <p className={clsx('rounded-lg px-3 py-2 text-sm',
          eligible > 0 ? 'bg-gray-50 text-gray-700 dark:bg-slate-700/50 dark:text-slate-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300')}>
          Se actualizan <strong>{eligible}</strong> de {total} producto{total === 1 ? '' : 's'} seleccionado{total === 1 ? '' : 's'}.
          {eligible < total && (total - eligible === 1
            ? ` El otro no tiene ${mode === 'SALE_USD' ? 'precio de venta' : 'costo'} en USD y queda como está.`
            : ` Los otros ${total - eligible} no tienen ${mode === 'SALE_USD' ? 'precio de venta' : 'costo'} en USD y quedan como están.`)}
        </p>

        {selectedRows && eligibleRows.length > 0 && rateOk && (
          <div className="max-h-56 overflow-auto rounded-lg border border-gray-200 dark:border-slate-700">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 text-gray-400 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-1.5 text-left font-semibold">Producto</th>
                  <th className="px-3 py-1.5 text-right font-semibold">{mode === 'SALE_USD' ? 'Venta USD' : 'Costo USD'}</th>
                  <th className="px-3 py-1.5 text-right font-semibold">Venta s/IVA</th>
                  {mode === 'COST_USD' && <th className="px-3 py-1.5 text-right font-semibold">Costo s/IVA</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {eligibleRows.slice(0, 50).map((r) => {
                  const p = preview(r);
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-1.5 text-gray-700 dark:text-slate-200">{r.name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{usd((mode === 'SALE_USD' ? r.salePriceUSD : r.costUSD) ?? 0)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                        <span className="text-gray-400 line-through">{formatCurrency(r.price, 'ARS')}</span>{' '}
                        <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(p.price, 'ARS')}</span>
                      </td>
                      {mode === 'COST_USD' && (
                        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                          <span className="text-gray-400 line-through">{formatCurrency(r.cost, 'ARS')}</span>{' '}
                          <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(p.cost, 'ARS')}</span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-gray-400">Queda en el historial de precios y se puede deshacer desde ahí.</p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} isLoading={saving} disabled={!rateOk || eligible === 0}>Actualizar {eligible} precio{eligible === 1 ? '' : 's'}</Button>
        </div>
      </div>
    </Modal>
  );
}
