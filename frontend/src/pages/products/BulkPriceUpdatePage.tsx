import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { TrendingUp, TrendingDown, Save, RefreshCw, CheckSquare, Square, ChevronDown, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui';
import { PageHeader, SearchInput } from '../../components/shared';
import { productsService, categoriesService, brandsService, suppliersService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import type { Product, Category, Brand, Supplier } from '../../types';

// ── Types ────────────────────────────────────────────────────────
interface RowState {
  product: Product;
  newPrice: number;
  newCost: number;
  selected: boolean;
}

type AdjustTarget = 'price' | 'cost' | 'both';

// ── Filter simple select ─────────────────────────────────────────
function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          'appearance-none pl-3 pr-7 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/30',
          value
            ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 text-indigo-700 dark:text-indigo-400'
            : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'
        )}
      >
        <option value="">{label}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </span>
    </div>
  );
}

// ── Filter search-select ─────────────────────────────────────────
function FilterSearchSelect({
  placeholder, value, onChange, options, disabled,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const ref               = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // Close on outside click
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

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        className={clsx(
          'flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-xs font-medium rounded-lg border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 min-w-[120px]',
          disabled
            ? 'opacity-40 cursor-not-allowed bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-400'
            : value
            ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 text-indigo-700 dark:text-indigo-400'
            : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'
        )}
      >
        <span className="flex-1 text-left truncate max-w-[140px]">
          {selected ? selected.label : placeholder}
        </span>
        {value ? (
          <X
            className="w-3 h-3 shrink-0 opacity-60 hover:opacity-100"
            onClick={handleClear}
          />
        ) : (
          <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg w-56 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100 dark:border-slate-700">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          {/* Options */}
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400 dark:text-slate-500">Sin resultados</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => handleSelect(o.value)}
                  className={clsx(
                    'w-full text-left px-3 py-2 text-xs transition-colors duration-100',
                    o.value === value
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-medium'
                      : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                  )}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Delta badge ──────────────────────────────────────────────────
function DeltaBadge({ original, current }: { original: number; current: number }) {
  if (original === 0 || current === original) return <span className="text-gray-300 dark:text-slate-600 text-xs">—</span>;
  const pct = ((current - original) / original) * 100;
  const up = pct > 0;
  return (
    <span className={clsx(
      'inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full',
      up
        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
        : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
    )}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function BulkPriceUpdatePage() {
  const navigate = useNavigate();

  // Filter state
  const [supplierId, setSupplierId]       = useState('');
  const [categoryId, setCategoryId]       = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [brandId, setBrandId]             = useState('');
  const [search, setSearch]               = useState('');

  // Options
  const [suppliers, setSuppliers]         = useState<Supplier[]>([]);
  const [categories, setCategories]       = useState<Category[]>([]);
  const [brands, setBrands]               = useState<Brand[]>([]);

  // Derived: root categories and subcategories of selected category
  const rootCategories  = useMemo(() => categories.filter((c) => !c.parentId), [categories]);
  const subcategories   = useMemo(
    () => (categoryId ? categories.filter((c) => c.parentId === categoryId) : []),
    [categories, categoryId],
  );

  // When category changes, reset subcategory
  const handleCategoryChange = (id: string) => {
    setCategoryId(id);
    setSubcategoryId('');
  };

  // Rows (product id → RowState)
  const [rows, setRows]               = useState<Record<string, RowState>>({});
  const [isLoading, setIsLoading]     = useState(false);
  const [isSaving, setIsSaving]       = useState(false);
  const [showCost, setShowCost]       = useState(false);

  // Adjustment toolbar
  const [adjustPct, setAdjustPct]     = useState('');
  const [adjustTarget, setAdjustTarget] = useState<AdjustTarget>('price');

  // ── Load filter options ────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      suppliersService.getAll({ limit: 200, isActive: true }),
      categoriesService.getAll(),
      brandsService.getAll(),
    ]).then(([s, c, b]) => {
      setSuppliers(s.data);
      setCategories(c);
      setBrands(b);
    });
  }, []);

  // ── Load products ──────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      // When a subcategory is selected → filter by it directly.
      // When only a parent category is selected → don't filter by categoryId in the API
      // (products live in subcategories); we'll filter client-side across all children.
      const apiCategoryId = subcategoryId || (!subcategoryId && subcategories.length === 0 ? categoryId : undefined);

      const [result, supplierProds] = await Promise.all([
        productsService.getAll({
          limit: 500,
          categoryId: apiCategoryId || undefined,
          brandId:    brandId       || undefined,
          isActive:   true,
        }),
        supplierId ? suppliersService.getProducts(supplierId) : Promise.resolve(null),
      ]);

      let filtered = result.data;

      // Client-side category filter when parent has children
      if (categoryId && !subcategoryId && subcategories.length > 0) {
        const allowedIds = new Set([categoryId, ...subcategories.map((c) => c.id)]);
        filtered = filtered.filter((p) => p.categoryId != null && allowedIds.has(p.categoryId));
      }

      if (supplierProds) {
        const ids = new Set(supplierProds.map((p) => p.id));
        filtered = filtered.filter((p) => ids.has(p.id));
      }

      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
        );
      }

      setRows((prev) => {
        const next: Record<string, RowState> = {};
        filtered.forEach((p) => {
          // Preserve edits if product is already in prev state
          next[p.id] = prev[p.id]
            ? { ...prev[p.id], product: p }
            : { product: p, newPrice: Number(p.price), newCost: Number(p.cost), selected: false };
        });
        return next;
      });
    } catch {
      toast.error('Error al cargar productos');
    } finally {
      setIsLoading(false);
    }
  }, [supplierId, categoryId, subcategoryId, subcategories, brandId, search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // ── Derived ────────────────────────────────────────────────────
  const displayedIds = Object.keys(rows);
  const allSelected  = displayedIds.length > 0 && displayedIds.every((id) => rows[id].selected);
  const someSelected = displayedIds.some((id) => rows[id].selected);
  const selectedIds  = displayedIds.filter((id) => rows[id].selected);
  const modifiedRows = Object.values(rows).filter(
    (r) => r.newPrice !== Number(r.product.price) || r.newCost !== Number(r.product.cost)
  );

  // ── Handlers ──────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], selected: !prev[id].selected } }));

  const toggleAll = () => {
    const next = !allSelected;
    setRows((prev) => {
      const updated = { ...prev };
      displayedIds.forEach((id) => { updated[id] = { ...updated[id], selected: next }; });
      return updated;
    });
  };

  const setField = (id: string, field: 'newPrice' | 'newCost', raw: string) => {
    const val = parseFloat(raw);
    if (isNaN(val) || val < 0) return;
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  };

  const applyAdjustment = (direction: 1 | -1) => {
    const pct = parseFloat(adjustPct);
    if (!pct || pct <= 0) { toast.error('Ingresá un porcentaje válido'); return; }
    const factor = 1 + (direction * pct / 100);
    setRows((prev) => {
      const updated = { ...prev };
      selectedIds.forEach((id) => {
        const r = { ...updated[id] };
        if (adjustTarget === 'price' || adjustTarget === 'both')
          r.newPrice = Math.round(r.newPrice * factor * 100) / 100;
        if (adjustTarget === 'cost' || adjustTarget === 'both')
          r.newCost  = Math.round(r.newCost  * factor * 100) / 100;
        updated[id] = r;
      });
      return updated;
    });
  };

  const resetRow = (id: string) => {
    const p = rows[id].product;
    setRows((prev) => ({
      ...prev,
      [id]: { ...prev[id], newPrice: Number(p.price), newCost: Number(p.cost) },
    }));
  };

  const handleSave = async () => {
    if (modifiedRows.length === 0) { toast.error('No hay cambios para guardar'); return; }
    setIsSaving(true);
    try {
      const updates = modifiedRows.map((r) => ({
        id: r.product.id,
        ...(r.newPrice !== Number(r.product.price) && { price: r.newPrice }),
        ...(r.newCost  !== Number(r.product.cost)  && { cost:  r.newCost  }),
      }));
      const result = await productsService.bulkUpdatePrices(updates);
      toast.success(`${result.updated} productos actualizados`);
      navigate('/products');
    } catch {
      toast.error('Error al guardar precios');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Actualización de precios"
        subtitle="Modificá precios y costos por lote"
        backTo="/products"
        actions={
          <div className="flex items-center gap-2">
            {modifiedRows.length > 0 && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                {modifiedRows.length} modificado{modifiedRows.length !== 1 ? 's' : ''}
              </span>
            )}
            <Button onClick={handleSave} isLoading={isSaving} disabled={modifiedRows.length === 0}>
              <Save className="w-4 h-4 mr-2" />
              Guardar cambios
            </Button>
          </div>
        }
      />

      {/* ── Filter bar ── */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 mb-4 flex flex-wrap gap-3 items-center">
        <FilterSelect
          label="Proveedor"
          value={supplierId}
          onChange={setSupplierId}
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        />
        <FilterSearchSelect
          placeholder="Categoría"
          value={categoryId}
          onChange={handleCategoryChange}
          options={rootCategories.map((c) => ({ value: c.id, label: c.name }))}
        />
        {subcategories.length > 0 && (
          <FilterSearchSelect
            placeholder="Subcategoría"
            value={subcategoryId}
            onChange={setSubcategoryId}
            options={subcategories.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        <FilterSelect
          label="Marca"
          value={brandId}
          onChange={setBrandId}
          options={brands.map((b) => ({ value: b.id, label: b.name }))}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar nombre o SKU…"
          className="w-56"
        />
        <button
          onClick={loadProducts}
          className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors duration-150"
          title="Recargar"
        >
          <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* ── Adjustment toolbar (visible when rows selected) ── */}
      {someSelected && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
            {selectedIds.length} seleccionado{selectedIds.length !== 1 ? 's' : ''}
          </span>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.1"
              value={adjustPct}
              onChange={(e) => setAdjustPct(e.target.value)}
              placeholder="% de ajuste"
              className="w-28 px-2.5 py-1.5 text-xs border border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <select
              value={adjustTarget}
              onChange={(e) => setAdjustTarget(e.target.value as AdjustTarget)}
              className="px-2.5 py-1.5 text-xs border border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="price">Precio venta</option>
              <option value="cost">Costo</option>
              <option value="both">Precio + Costo</option>
            </select>
          </div>

          <button
            onClick={() => applyAdjustment(1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors duration-150"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Aumentar
          </button>
          <button
            onClick={() => applyAdjustment(-1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors duration-150"
          >
            <TrendingDown className="w-3.5 h-3.5" />
            Reducir
          </button>

          <label className="ml-auto flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCost}
              onChange={(e) => setShowCost(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-indigo-600"
            />
            Mostrar costo
          </label>
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {/* Header */}
        <div className={clsx(
          'grid gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-slate-700 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider',
          showCost
            ? 'grid-cols-[32px_1fr_80px_110px_72px_80px_110px_72px_32px]'
            : 'grid-cols-[32px_1fr_80px_110px_72px_32px]'
        )}>
          <button onClick={toggleAll} className="flex items-center justify-center text-gray-400 dark:text-slate-500 hover:text-indigo-600">
            {allSelected
              ? <CheckSquare className="w-4 h-4 text-indigo-600" />
              : <Square className="w-4 h-4" />}
          </button>
          <span>Producto</span>
          {showCost && <span>Costo actual</span>}
          {showCost && <span>Nuevo costo</span>}
          {showCost && <span>Δ costo</span>}
          <span>Precio actual</span>
          <span>Nuevo precio</span>
          <span>Δ precio</span>
          <span></span>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[32px_1fr_80px_110px_72px_32px] gap-3 px-4 py-3 animate-pulse">
                <div className="w-4 h-4 bg-gray-100 dark:bg-slate-700 rounded" />
                <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-3/4" />
                <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded" />
                <div className="h-8 bg-gray-100 dark:bg-slate-700 rounded-lg" />
                <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-12" />
                <div className="h-4 w-4 bg-gray-100 dark:bg-slate-700 rounded" />
              </div>
            ))}
          </div>
        ) : displayedIds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Sin productos</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">Ajustá los filtros para cargar productos</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-slate-700/50 max-h-[60vh] overflow-y-auto">
            {displayedIds.map((id) => {
              const r = rows[id];
              const p = r.product;
              const priceModified = r.newPrice !== Number(p.price);
              const costModified  = r.newCost  !== Number(p.cost);
              const isModified    = priceModified || costModified;

              return (
                <div
                  key={id}
                  className={clsx(
                    'grid gap-3 px-4 py-2.5 items-center transition-colors duration-100',
                    showCost
                      ? 'grid-cols-[32px_1fr_80px_110px_72px_80px_110px_72px_32px]'
                      : 'grid-cols-[32px_1fr_80px_110px_72px_32px]',
                    isModified
                      ? 'bg-amber-50/60 dark:bg-amber-900/10'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-700/30'
                  )}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleSelect(id)}
                    className="flex items-center justify-center text-gray-400 dark:text-slate-500 hover:text-indigo-600"
                  >
                    {r.selected
                      ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                      : <Square className="w-4 h-4" />}
                  </button>

                  {/* Name / SKU */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate leading-tight">{p.name}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 font-mono">{p.sku}</p>
                  </div>

                  {/* Cost current */}
                  {showCost && (
                    <span className="text-sm tabular-nums text-gray-500 dark:text-slate-400">
                      {formatCurrency(Number(p.cost), 'ARS')}
                    </span>
                  )}

                  {/* New cost input */}
                  {showCost && (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={r.newCost}
                      onChange={(e) => setField(id, 'newCost', e.target.value)}
                      className={clsx(
                        'w-full px-2.5 py-1.5 text-sm tabular-nums rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-slate-700 dark:text-slate-200',
                        costModified
                          ? 'border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-900/20'
                          : 'border-gray-200 dark:border-slate-600 bg-white'
                      )}
                    />
                  )}

                  {/* Delta cost */}
                  {showCost && (
                    <DeltaBadge original={Number(p.cost)} current={r.newCost} />
                  )}

                  {/* Price current */}
                  <span className="text-sm tabular-nums text-gray-500 dark:text-slate-400">
                    {formatCurrency(Number(p.price), 'ARS')}
                  </span>

                  {/* New price input */}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={r.newPrice}
                    onChange={(e) => setField(id, 'newPrice', e.target.value)}
                    className={clsx(
                      'w-full px-2.5 py-1.5 text-sm tabular-nums rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-slate-700 dark:text-slate-200',
                      priceModified
                        ? 'border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-900/20'
                        : 'border-gray-200 dark:border-slate-600 bg-white'
                    )}
                  />

                  {/* Delta price */}
                  <DeltaBadge original={Number(p.price)} current={r.newPrice} />

                  {/* Reset */}
                  <button
                    onClick={() => resetRow(id)}
                    disabled={!isModified}
                    className={clsx(
                      'text-xs transition-colors duration-150',
                      isModified
                        ? 'text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 cursor-pointer'
                        : 'text-gray-200 dark:text-slate-700 cursor-default'
                    )}
                    title="Deshacer cambios de este producto"
                  >
                    ↺
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        {!isLoading && displayedIds.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
            <span className="text-xs text-gray-400 dark:text-slate-500">
              {displayedIds.length} producto{displayedIds.length !== 1 ? 's' : ''}
              {modifiedRows.length > 0 && (
                <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">
                  · {modifiedRows.length} con cambios pendientes
                </span>
              )}
            </span>
            <Button onClick={handleSave} isLoading={isSaving} disabled={modifiedRows.length === 0} size="sm">
              <Save className="w-3.5 h-3.5 mr-1.5" />
              Guardar {modifiedRows.length > 0 ? `(${modifiedRows.length})` : ''}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
