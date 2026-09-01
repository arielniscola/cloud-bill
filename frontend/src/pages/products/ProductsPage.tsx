import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Edit, Trash2, Package, ChevronDown, X, RefreshCw, Search, Upload, Wand2,
  MoreHorizontal, PanelRight, AlertTriangle, ChevronUp, Loader2, ImageOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button, Card, Modal } from '../../components/ui';
import { PageHeader, SearchInput, ConfirmDialog, CsvImportModal, Pagination } from '../../components/shared';
import { productsService, rubrosService, brandsService, suppliersService, stockService } from '../../services';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { Product, Rubro, Brand, Supplier, Stock, StockStateFilter, ProductSortKey } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';

// ── Helpers ──────────────────────────────────────────────────────
function margin(cost: number, price: number) {
  if (!cost || !price || price <= cost) return null;
  return ((price - cost) / price) * 100;
}

function marginColor(pct: number | null) {
  if (pct === null) return 'text-gray-400 dark:text-slate-500';
  if (pct >= 40) return 'text-emerald-700 dark:text-emerald-400';
  if (pct >= 20) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-500 dark:text-red-400';
}

function priceAgeLabel(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff < 30) return `Hace ${diff}d`;
  if (diff < 365) return `Hace ${Math.floor(diff / 30)}m`;
  return `Hace ${Math.floor(diff / 365)}a`;
}

function priceAgeColor(dateStr: string | null): string {
  if (!dateStr) return 'text-gray-400 dark:text-slate-500';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff <= 10) return 'text-emerald-600 dark:text-emerald-400';
  if (diff <= 20) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-500 dark:text-red-400';
}

type StockKind = 'none' | 'out' | 'low' | 'ok';

/** Disponible = suma de (quantity - reservedQuantity) entre depósitos. */
function stockInfo(p: Product): { kind: StockKind; available: number } {
  if (!p.trackStock) return { kind: 'none', available: 0 };
  const available = (p.stockQuantity ?? 0) - (p.stockReserved ?? 0);
  if (available <= 0) return { kind: 'out', available };
  if (p.stockMinQuantity != null && available <= p.stockMinQuantity) return { kind: 'low', available };
  return { kind: 'ok', available };
}

// ── Compact filter select ────────────────────────────────────────
function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const isActive = !!value;
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none pl-3 pr-7 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
          isActive
            ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 text-indigo-700 dark:text-indigo-400'
            : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'
        }`}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 dark:text-slate-500 pointer-events-none" />
    </div>
  );
}

// ── Brand searchable select ──────────────────────────────────────
function BrandSearchSelect({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selectedLabel = options.find((o) => o.value === value)?.label;
  const isActive = !!value;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setQuery(''); }}
        className={`inline-flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
          isActive
            ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 text-indigo-700 dark:text-indigo-400'
            : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'
        }`}
      >
        {selectedLabel ?? 'Marca'}
        {isActive ? (
          <X
            className="w-3 h-3 ml-0.5 opacity-60 hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
          />
        ) : (
          <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-52 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-gray-100 dark:border-slate-700">
            <Search className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar marca…"
              className="flex-1 text-xs bg-transparent outline-none text-gray-700 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <ul className="max-h-52 overflow-y-auto py-1 [scrollbar-width:thin]">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-xs text-center text-gray-400 dark:text-slate-500">Sin resultados</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors duration-100 ${
                      o.value === value
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-semibold'
                        : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {o.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Menú de acciones del encabezado ──────────────────────────────
function HeaderMenu({ items }: { items: { label: string; icon: typeof Upload; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" onClick={() => setOpen((o) => !o)} aria-label="Más acciones" aria-expanded={open}>
        <MoreHorizontal className="w-4 h-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-60 p-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => { setOpen(false); item.onClick(); }}
              className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm text-left text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              <item.icon className="w-4 h-4 text-gray-400 dark:text-slate-500" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cabecera de columna ordenable ────────────────────────────────
function SortHeader({
  label, sortKey, current, order, onSort, className,
}: {
  label: string;
  sortKey: ProductSortKey;
  current: ProductSortKey;
  order: 'asc' | 'desc';
  onSort: (k: ProductSortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={clsx(
        'flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors',
        active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200',
        className
      )}
    >
      {label}
      {active && (order === 'asc'
        ? <ChevronUp className="w-3 h-3" />
        : <ChevronDown className="w-3 h-3" />)}
    </button>
  );
}

// ── Modal: aplicar un porcentaje a los precios seleccionados ─────
function BulkPriceModal({
  products, onClose, onDone,
}: {
  products: Product[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [percent, setPercent] = useState('');
  const [alsoCost, setAlsoCost] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const pct = Number(percent.replace(',', '.'));
  const isValid = percent.trim() !== '' && Number.isFinite(pct) && pct !== 0;
  const factor = 1 + pct / 100;
  const sample = products[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setIsSaving(true);
    try {
      const updates = products.map((p) => ({
        id: p.id,
        price: Math.round(Number(p.price) * factor * 100) / 100,
        ...(alsoCost ? { cost: Math.round(Number(p.cost) * factor * 100) / 100 } : {}),
      }));
      const { updated } = await productsService.bulkUpdatePrices(updates);
      toast.success(`${updated} ${updated === 1 ? 'producto actualizado' : 'productos actualizados'}`);
      onDone();
    } catch {
      toast.error('Error al actualizar precios');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Actualizar precios" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Se aplica sobre {products.length} {products.length === 1 ? 'producto seleccionado' : 'productos seleccionados'}.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
            Porcentaje
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="Ej: 12  ·  -5 para bajar"
              className="block w-full h-10 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 shadow-sm text-sm px-3 pr-8 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={alsoCost}
            onChange={(e) => setAlsoCost(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500/30"
          />
          <span className="text-sm text-gray-700 dark:text-slate-300">Aplicar también al costo</span>
        </label>

        {isValid && sample && (
          <div className="rounded-lg bg-gray-50 dark:bg-slate-900/40 border border-gray-100 dark:border-slate-700 px-3 py-2.5">
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-1">Ejemplo · {sample.name}</p>
            <p className="text-sm text-gray-700 dark:text-slate-300 tabular-nums">
              {formatCurrency(sample.price)}
              <span className="mx-2 text-gray-300 dark:text-slate-600">→</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {formatCurrency(Math.round(Number(sample.price) * factor * 100) / 100)}
              </span>
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-1 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={isSaving} disabled={!isValid}>Aplicar</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Modal: cambiar rubro / marca / IVA en lote ───────────────────
function BulkFieldsModal({
  ids, rubroOptions, brandOptions, onClose, onDone,
}: {
  ids: string[];
  rubroOptions: { value: string; label: string }[];
  brandOptions: { value: string; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [rubroId, setRubroId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges = !!rubroId || !!brandId || taxRate !== '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges) return;
    setIsSaving(true);
    try {
      const data: { rubroId?: string; brandId?: string; taxRate?: number } = {};
      if (rubroId) data.rubroId = rubroId;
      if (brandId) data.brandId = brandId;
      if (taxRate !== '') data.taxRate = Number(taxRate);
      const { updated } = await productsService.bulkUpdate(ids, data);
      toast.success(`${updated} ${updated === 1 ? 'producto actualizado' : 'productos actualizados'}`);
      onDone();
    } catch {
      toast.error('Error al actualizar productos');
    } finally {
      setIsSaving(false);
    }
  };

  const selectClass =
    'block w-full h-10 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 shadow-sm text-sm px-3 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500';

  return (
    <Modal isOpen onClose={onClose} title="Cambiar rubro, marca o IVA" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Se aplica sobre {ids.length} {ids.length === 1 ? 'producto' : 'productos'}. Los campos que dejes vacíos no se tocan.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Rubro</label>
          <select value={rubroId} onChange={(e) => setRubroId(e.target.value)} className={selectClass}>
            <option value="">Sin cambios</option>
            {rubroOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Marca</label>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={selectClass}>
            <option value="">Sin cambios</option>
            {brandOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Alícuota de IVA</label>
          <select value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className={selectClass}>
            <option value="">Sin cambios</option>
            <option value="0">0%</option>
            <option value="10.5">10,5%</option>
            <option value="21">21%</option>
            <option value="27">27%</option>
          </select>
        </div>

        <div className="flex gap-2 pt-1 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={isSaving} disabled={!hasChanges}>Aplicar</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Panel de detalle ─────────────────────────────────────────────
function DetailPanel({
  product, onClose, onSaved, onEdit,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
  onEdit: (id: string) => void;
}) {
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [stocks, setStocks] = useState<Stock[] | null>(null);

  useEffect(() => {
    if (!product) return;
    setCost(String(product.cost ?? ''));
    setPrice(String(product.price ?? ''));
    setStocks(null);
    if (!product.trackStock) return;
    let cancelled = false;
    stockService.getProductStock(product.id)
      .then((rows) => { if (!cancelled) setStocks(rows); })
      .catch(() => { if (!cancelled) setStocks([]); });
    return () => { cancelled = true; };
  }, [product]);

  if (!product) {
    return (
      <div className="w-[380px] flex-shrink-0 self-start bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">Detalle</span>
          <button onClick={onClose} aria-label="Cerrar panel" className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-col items-center justify-center text-center px-6 py-14">
          <Package className="w-8 h-8 text-gray-200 dark:text-slate-700 mb-3" />
          <p className="text-sm text-gray-400 dark:text-slate-500">Elegí un producto de la lista</p>
        </div>
      </div>
    );
  }

  const costNum = Number(cost.replace(',', '.'));
  const priceNum = Number(price.replace(',', '.'));
  const liveMargin = margin(costNum, priceNum);
  const dirty = costNum !== Number(product.cost) || priceNum !== Number(product.price);
  const canSave = dirty && Number.isFinite(costNum) && Number.isFinite(priceNum) && priceNum > 0;

  const info = stockInfo(product);
  const totalReserved = stocks?.reduce((s, r) => s + Number(r.reservedQuantity), 0) ?? product.stockReserved ?? 0;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await productsService.update(product.id, { cost: costNum, price: priceNum });
      toast.success('Precio actualizado');
      onSaved();
    } catch {
      toast.error('Error al guardar el precio');
    } finally {
      setIsSaving(false);
    }
  };

  const fieldClass =
    'block w-full h-9 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 shadow-sm text-sm px-2.5 tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500';

  return (
    <div className="w-[380px] flex-shrink-0 self-start bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
      {/* Encabezado */}
      <div className="p-4 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-start gap-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span className="font-mono text-[10px] font-semibold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                {product.sku}
              </span>
              {product.brand && (
                <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 px-1.5 py-0.5 rounded-full">
                  {product.brand.name}
                </span>
              )}
              <span className={clsx(
                'text-[10px] font-semibold px-1.5 py-0.5 rounded-full border',
                product.isActive
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                  : 'bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-600'
              )}>
                {product.isActive ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white leading-snug">{product.name}</h2>
            {product.rubro && (
              <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">{product.rubro.name}</p>
            )}
            {product.imageUrl && (
              <img
                src={product.imageUrl}
                alt=""
                className="mt-3 w-full max-h-40 object-contain rounded-lg border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            )}
          </div>
          <button onClick={onClose} aria-label="Cerrar panel" className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Precio */}
      <div className="p-4 border-b border-gray-100 dark:border-slate-700 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">Precio</p>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Costo</label>
            <input type="text" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Precio de venta</label>
            <input type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={clsx(fieldClass, 'font-semibold')} />
          </div>
        </div>

        <div className={clsx(
          'flex items-center justify-between px-3 py-2 rounded-lg border',
          liveMargin === null ? 'bg-gray-50 dark:bg-slate-900/40 border-gray-100 dark:border-slate-700'
            : liveMargin >= 40 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
            : liveMargin >= 20 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        )}>
          <span className="text-xs text-gray-600 dark:text-slate-400">Margen</span>
          <span className={clsx('text-sm font-bold tabular-nums', marginColor(liveMargin))}>
            {liveMargin !== null ? `${liveMargin.toFixed(1)}%` : '—'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 dark:text-slate-500">Último cambio de precio</span>
          <span className={clsx('text-xs font-medium', priceAgeColor(product.priceUpdatedAt))}>
            {priceAgeLabel(product.priceUpdatedAt)}
          </span>
        </div>
      </div>

      {/* Stock */}
      <div className="p-4 border-b border-gray-100 dark:border-slate-700 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">Stock</p>
          {info.kind === 'out' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-red-400">
              <AlertTriangle className="w-3 h-3" />Sin stock
            </span>
          )}
          {info.kind === 'low' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3" />Bajo mínimo
            </span>
          )}
        </div>

        {!product.trackStock ? (
          <p className="text-sm text-gray-400 dark:text-slate-500">Este producto no lleva inventario.</p>
        ) : stocks === null ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />Cargando…
          </div>
        ) : stocks.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-slate-500">Sin movimientos en ningún depósito.</p>
        ) : (
          <div className="space-y-1.5">
            {stocks.map((s) => (
              <div key={s.id} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-slate-400 truncate">
                  {s.warehouse?.name ?? 'Depósito'}
                </span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                  {formatNumber(Number(s.quantity), 0)}
                </span>
              </div>
            ))}
            {totalReserved > 0 && (
              <>
                <div className="h-px bg-gray-100 dark:bg-slate-700 my-1" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 dark:text-slate-500">Reservado en pedidos</span>
                  <span className="text-xs text-gray-500 dark:text-slate-400 tabular-nums">{formatNumber(totalReserved, 0)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Datos */}
      <div className="p-4 border-b border-gray-100 dark:border-slate-700 space-y-2">
        {[
          ['Proveedor', product.supplier?.name ?? '—'],
          ['IVA', `${product.taxRate}%`],
          ['Código de barras', product.barcode ?? '—'],
          ['Unidad', product.unit ?? '—'],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">{label}</span>
            <span className="text-xs text-gray-700 dark:text-slate-300 truncate">{value}</span>
          </div>
        ))}
      </div>

      <div className="p-3.5 flex gap-2">
        <Button className="flex-1" isLoading={isSaving} disabled={!canSave} onClick={handleSave}>
          Guardar precio
        </Button>
        <Button variant="outline" onClick={() => onEdit(product.id)}>Ficha completa</Button>
      </div>
    </div>
  );
}

type StatusFilter = 'all' | 'active' | 'inactive';

export default function ProductsPage() {
  const navigate = useNavigate();
  const { canUseModule } = usePermissions();
  const imagesEnabled = canUseModule('imagenes');
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [rubroFilter, setRubroFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [sortBy, setSortBy] = useState<ProductSortKey>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [bulkFieldsOpen, setBulkFieldsOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkWorking, setIsBulkWorking] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelProductId, setPanelProductId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([rubrosService.getAll(), brandsService.getAll(), suppliersService.getAll({ limit: 500, isActive: true })])
      .then(([cats, brnds, sups]) => { setRubros(cats); setBrands(brnds); setSuppliers(sups.data); })
      .catch(() => {});
  }, []);

  const isActiveFilter = statusFilter === 'all' ? undefined : statusFilter === 'active';

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await productsService.getAll({
        page,
        limit,
        search,
        isActive: isActiveFilter,
        rubroId: rubroFilter || undefined,
        brandId: brandFilter || undefined,
        supplierId: supplierFilter || undefined,
        stockState: (stockFilter || undefined) as StockStateFilter | undefined,
        sortBy,
        sortOrder,
      });
      setProducts(response.data);
      setTotal(response.total);
    } catch {
      toast.error('Error al cargar productos');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, search, isActiveFilter, rubroFilter, brandFilter, supplierFilter, stockFilter, sortBy, sortOrder]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // La selección es de la página que estás mirando: si cambia el conjunto, se limpia.
  useEffect(() => { setSelectedIds(new Set()); }, [page, search, statusFilter, rubroFilter, brandFilter, supplierFilter, stockFilter]);

  const resetPage = () => setPage(1);

  const panelProduct = useMemo(
    () => products.find((p) => p.id === panelProductId) ?? null,
    [products, panelProductId]
  );

  const selectedProducts = useMemo(
    () => products.filter((p) => selectedIds.has(p.id)),
    [products, selectedIds]
  );

  const handleSort = (key: ProductSortKey) => {
    if (key === sortBy) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(key); setSortOrder('asc'); }
    resetPage();
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = products.length > 0 && products.every((p) => selectedIds.has(p.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(products.map((p) => p.id)));
  };

  const openPanel = (p: Product) => { setPanelProductId(p.id); setPanelOpen(true); };
  const closePanel = () => { setPanelOpen(false); setPanelProductId(null); };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await productsService.delete(deleteId);
      toast.success('Producto eliminado');
      if (panelProductId === deleteId) closePanel();
      setDeleteId(null);
      fetchProducts();
    } catch {
      toast.error('Error al eliminar producto');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkActive = async (isActive: boolean) => {
    setIsBulkWorking(true);
    try {
      const { updated } = await productsService.bulkUpdate([...selectedIds], { isActive });
      toast.success(`${updated} ${updated === 1 ? 'producto' : 'productos'} ${isActive ? 'activados' : 'desactivados'}`);
      setSelectedIds(new Set());
      fetchProducts();
    } catch {
      toast.error('Error al cambiar el estado');
    } finally {
      setIsBulkWorking(false);
    }
  };

  const handleBulkDelete = async () => {
    setIsBulkWorking(true);
    try {
      const ids = [...selectedIds];
      const results = await Promise.allSettled(ids.map((id) => productsService.delete(id)));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - ok;
      if (ok > 0) toast.success(`${ok} ${ok === 1 ? 'producto eliminado' : 'productos eliminados'}`);
      if (failed > 0) toast.error(`${failed} no se ${failed === 1 ? 'pudo' : 'pudieron'} eliminar`);
      setBulkDeleteOpen(false);
      setSelectedIds(new Set());
      closePanel();
      fetchProducts();
    } finally {
      setIsBulkWorking(false);
    }
  };

  const rubroOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const roots = rubros.filter((c) => !c.parentId);
    for (const root of roots) {
      opts.push({ value: root.id, label: root.name });
      for (const child of root.children ?? []) {
        opts.push({ value: child.id, label: `└ ${child.name}` });
      }
    }
    return opts;
  }, [rubros]);

  const brandOptions = useMemo(() => brands.map((b) => ({ value: b.id, label: b.name })), [brands]);
  const supplierOptions = useMemo(() => suppliers.map((s) => ({ value: s.id, label: s.name })), [suppliers]);

  const activeFilterCount =
    [rubroFilter, brandFilter, supplierFilter, stockFilter, statusFilter !== 'all'].filter(Boolean).length;

  const clearFilters = () => {
    setRubroFilter(''); setBrandFilter(''); setSupplierFilter(''); setStockFilter('');
    setStatusFilter('all'); resetPage();
  };

  const tabs: { id: StatusFilter; label: string }[] = [
    { id: 'all',      label: 'Todos' },
    { id: 'active',   label: 'Activos' },
    { id: 'inactive', label: 'Inactivos' },
  ];

  // Con el panel abierto la tabla suelta las columnas secundarias: el detalle las muestra igual.
  const showSecondary = !panelOpen;

  const renderStock = (p: Product) => {
    const { kind, available } = stockInfo(p);
    if (kind === 'none') {
      return (
        <div className="text-right">
          <div className="text-sm font-semibold text-gray-300 dark:text-slate-600">—</div>
          <div className="text-[11px] text-gray-400 dark:text-slate-500">no lleva</div>
        </div>
      );
    }
    if (kind === 'out') {
      return (
        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
            <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">0</span>
          </div>
          <div className="text-[11px] text-red-600 dark:text-red-400">sin stock</div>
        </div>
      );
    }
    if (kind === 'low') {
      return (
        <div className="text-right">
          <div className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">{formatNumber(available, 0)}</div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400">bajo mínimo</div>
        </div>
      );
    }
    return (
      <div className="text-right">
        <div className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{formatNumber(available, 0)}</div>
        <div className="text-[11px] text-gray-400 dark:text-slate-500">{p.unit?.toLowerCase() ?? 'un.'}</div>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Productos"
        subtitle={`${total} ${total === 1 ? 'producto' : 'productos'}${activeFilterCount > 0 ? ' · filtros activos' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <HeaderMenu
              items={[
                { label: 'Importar CSV',          icon: Upload,    onClick: () => setShowImport(true) },
                { label: 'Actualizar precios',    icon: RefreshCw, onClick: () => navigate('/products/bulk-price-update') },
                { label: 'Actualización masiva',  icon: Wand2,     onClick: () => navigate('/products/bulk-update') },
              ]}
            />
            <Button onClick={() => navigate('/products/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo producto
            </Button>
          </div>
        }
      />

      <div className="flex gap-4 items-start">
        <Card padding="none" className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setStatusFilter(t.id); resetPage(); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                      statusFilter === t.id
                        ? 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 shadow-sm'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {rubroOptions.length > 0 && (
                <FilterSelect label="Rubro" value={rubroFilter} onChange={(v) => { setRubroFilter(v); resetPage(); }} options={rubroOptions} />
              )}
              {brandOptions.length > 0 && (
                <BrandSearchSelect value={brandFilter} onChange={(v) => { setBrandFilter(v); resetPage(); }} options={brandOptions} />
              )}
              {supplierOptions.length > 0 && (
                <FilterSelect label="Proveedor" value={supplierFilter} onChange={(v) => { setSupplierFilter(v); resetPage(); }} options={supplierOptions} />
              )}
              <FilterSelect
                label="Stock"
                value={stockFilter}
                onChange={(v) => { setStockFilter(v); resetPage(); }}
                options={[
                  { value: 'with', label: 'Con stock' },
                  { value: 'low',  label: 'Bajo mínimo' },
                  { value: 'out',  label: 'Sin stock' },
                ]}
              />
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 underline ml-0.5">
                  Limpiar filtros
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <SearchInput
                value={search}
                onChange={(v) => { setSearch(v); resetPage(); }}
                placeholder="Buscar por SKU, nombre…"
                className={panelOpen ? 'w-44' : 'w-64'}
              />
              <button
                onClick={() => (panelOpen ? closePanel() : setPanelOpen(true))}
                aria-label={panelOpen ? 'Cerrar panel de detalle' : 'Abrir panel de detalle'}
                aria-pressed={panelOpen}
                title="Panel de detalle"
                className={clsx(
                  'w-8 h-8 rounded-lg border flex items-center justify-center transition-colors flex-shrink-0',
                  panelOpen
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400'
                    : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-400 dark:text-slate-500 hover:border-gray-300 dark:hover:border-slate-500'
                )}
              >
                <PanelRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Barra de selección */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800">
              <span className="text-[13px] font-semibold text-indigo-900 dark:text-indigo-300">
                {selectedIds.size} {selectedIds.size === 1 ? 'producto seleccionado' : 'productos seleccionados'}
              </span>
              <div className="flex-1" />
              <Button size="sm" variant="secondary" disabled={isBulkWorking} onClick={() => setBulkPriceOpen(true)}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" />Actualizar precios
              </Button>
              <Button size="sm" variant="secondary" disabled={isBulkWorking} onClick={() => setBulkFieldsOpen(true)}>
                Cambiar rubro o marca
              </Button>
              <Button size="sm" variant="secondary" disabled={isBulkWorking} onClick={() => handleBulkActive(false)}>
                Desactivar
              </Button>
              <Button size="sm" variant="danger" disabled={isBulkWorking} onClick={() => setBulkDeleteOpen(true)}>
                Eliminar
              </Button>
              <button
                onClick={() => setSelectedIds(new Set())}
                aria-label="Limpiar selección"
                className="p-1 rounded text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Cabecera */}
          <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50/80 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected; }}
              onChange={toggleAll}
              aria-label="Seleccionar todos"
              className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500/30 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <SortHeader label="Producto" sortKey="name" current={sortBy} order={sortOrder} onSort={handleSort} />
            </div>
            <span className="w-[88px] text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex-shrink-0">Stock</span>
            {showSecondary && (
              <div className="w-[104px] flex justify-end flex-shrink-0">
                <SortHeader label="Costo" sortKey="cost" current={sortBy} order={sortOrder} onSort={handleSort} />
              </div>
            )}
            <div className="w-[112px] flex justify-end flex-shrink-0">
              <SortHeader label="Precio" sortKey="price" current={sortBy} order={sortOrder} onSort={handleSort} />
            </div>
            <span className="w-[74px] text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex-shrink-0">Margen</span>
            {showSecondary && (
              <div className="w-[88px] flex-shrink-0">
                <SortHeader label="Últ. precio" sortKey="priceUpdatedAt" current={sortBy} order={sortOrder} onSort={handleSort} />
              </div>
            )}
            {showSecondary && (
              <span className="w-[56px] text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex-shrink-0">IVA</span>
            )}
            <span className="w-[86px] text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex-shrink-0">Estado</span>
            {showSecondary && <span className="w-[68px] flex-shrink-0" />}
          </div>

          {/* Filas */}
          {isLoading ? (
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-4 h-4 rounded bg-gray-100 dark:bg-slate-700 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-24" />
                    <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-56" />
                  </div>
                  <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-20" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-4">
                <Package className="w-7 h-7 text-gray-300 dark:text-slate-600" />
              </div>
              {search || activeFilterCount > 0 ? (
                <>
                  <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">Sin resultados</p>
                  <p className="text-sm text-gray-400 dark:text-slate-500 max-w-xs leading-relaxed mb-5">
                    Ningún producto coincide con los filtros aplicados.
                  </p>
                  <Button variant="secondary" onClick={() => { setSearch(''); clearFilters(); }}>Limpiar filtros</Button>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">Sin productos</p>
                  <p className="text-sm text-gray-400 dark:text-slate-500 max-w-xs leading-relaxed mb-5">
                    Creá tu catálogo de productos para usarlos en facturas, remitos y compras.
                  </p>
                  <Button onClick={() => navigate('/products/new')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo producto
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {products.map((p) => {
                const m = margin(Number(p.cost), Number(p.price));
                const isSelected = selectedIds.has(p.id);
                const isOpen = panelOpen && panelProductId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => openPanel(p)}
                    className={clsx(
                      'group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                      isOpen
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-[3px] border-l-indigo-600 pl-[13px]'
                        : isSelected
                          ? 'bg-indigo-50/50 dark:bg-indigo-900/10'
                          : 'hover:bg-gray-50/80 dark:hover:bg-slate-700/50',
                      !p.isActive && !isOpen && 'bg-gray-50/40 dark:bg-slate-900/20'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleRow(p.id)}
                      aria-label={`Seleccionar ${p.name}`}
                      className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500/30 flex-shrink-0"
                    />

                    {imagesEnabled && (
                      <div className="w-9 h-9 flex-shrink-0 rounded-md border border-gray-100 dark:border-slate-700 overflow-hidden bg-gray-50 dark:bg-slate-800 flex items-center justify-center">
                        {p.imageUrl ? (
                          // loading="lazy": el listado virtualizado puede tener
                          // cientos de filas y no queremos pedir todas las fotos.
                          <img src={p.imageUrl} alt="" loading="lazy" className="w-full h-full object-contain" />
                        ) : (
                          <ImageOff className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
                        )}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-[10px] font-semibold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded flex-shrink-0">
                          {p.sku}
                        </span>
                        {p.brand && (
                          <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 px-1.5 py-0.5 rounded-full truncate max-w-[100px]">
                            {p.brand.name}
                          </span>
                        )}
                        {!p.trackStock && (
                          <span className="text-[10px] font-medium text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            Servicio
                          </span>
                        )}
                      </div>
                      <p className={clsx(
                        'text-sm font-medium truncate leading-tight',
                        p.isActive ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-slate-400'
                      )}>
                        {p.name}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 truncate leading-none">
                        {[p.rubro?.name, p.supplier?.name].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>

                    <div className="w-[88px] flex-shrink-0">{renderStock(p)}</div>

                    {showSecondary && (
                      <span className="w-[104px] text-right text-sm text-gray-600 dark:text-slate-400 flex-shrink-0 tabular-nums">
                        {formatCurrency(p.cost)}
                      </span>
                    )}

                    <span className="w-[112px] text-right text-sm font-semibold text-gray-800 dark:text-slate-200 flex-shrink-0 tabular-nums">
                      {formatCurrency(p.price)}
                    </span>

                    <span className={clsx('w-[74px] text-right text-xs font-semibold flex-shrink-0 tabular-nums', marginColor(m))}>
                      {m !== null ? `${m.toFixed(1)}%` : '—'}
                    </span>

                    {showSecondary && (
                      <span
                        className={clsx('w-[88px] text-xs font-medium flex-shrink-0', priceAgeColor(p.priceUpdatedAt))}
                        title={p.priceUpdatedAt ? new Date(p.priceUpdatedAt).toLocaleString('es-AR') : 'Sin actualización registrada'}
                      >
                        {priceAgeLabel(p.priceUpdatedAt)}
                      </span>
                    )}

                    {showSecondary && (
                      <span className="w-[56px] text-right flex-shrink-0">
                        <span className="text-[11px] font-semibold bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 px-1.5 py-0.5 rounded-full">
                          {p.taxRate}%
                        </span>
                      </span>
                    )}

                    <span className={clsx(
                      'w-[86px] inline-flex items-center gap-1.5 text-xs font-medium flex-shrink-0',
                      p.isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'
                    )}>
                      <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', p.isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600')} />
                      {p.isActive ? 'Activo' : 'Inactivo'}
                    </span>

                    {showSecondary && (
                      <div className="w-[68px] flex items-center justify-end gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        <button
                          title="Editar"
                          onClick={(e) => { e.stopPropagation(); navigate(`/products/${p.id}/edit`); }}
                          className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title="Eliminar"
                          onClick={(e) => { e.stopPropagation(); setDeleteId(p.id); }}
                          className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {total > 0 && (
            <Pagination
              page={page}
              totalPages={Math.ceil(total / limit)}
              limit={limit}
              total={total}
              onPageChange={setPage}
              onLimitChange={(l) => { setLimit(l); setPage(1); }}
            />
          )}
        </Card>

        {panelOpen && (
          <DetailPanel
            product={panelProduct}
            onClose={closePanel}
            onSaved={fetchProducts}
            onEdit={(id) => navigate(`/products/${id}/edit`)}
          />
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar producto"
        message="¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />

      <ConfirmDialog
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="Eliminar productos"
        message={`Se van a eliminar ${selectedIds.size} productos. Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        isLoading={isBulkWorking}
      />

      {bulkPriceOpen && (
        <BulkPriceModal
          products={selectedProducts}
          onClose={() => setBulkPriceOpen(false)}
          onDone={() => { setBulkPriceOpen(false); setSelectedIds(new Set()); fetchProducts(); }}
        />
      )}

      {bulkFieldsOpen && (
        <BulkFieldsModal
          ids={[...selectedIds]}
          rubroOptions={rubroOptions}
          brandOptions={brandOptions}
          onClose={() => setBulkFieldsOpen(false)}
          onDone={() => { setBulkFieldsOpen(false); setSelectedIds(new Set()); fetchProducts(); }}
        />
      )}

      {showImport && (
        <CsvImportModal
          entity="products"
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); fetchProducts(); }}
        />
      )}
    </div>
  );
}
