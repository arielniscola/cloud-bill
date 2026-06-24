import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Save, RefreshCw, CheckSquare, Square, ChevronDown, X, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui';
import { PageHeader, SearchInput } from '../../components/shared';
import { productsService, rubrosService, brandsService, suppliersService } from '../../services';
import type { Product, Rubro, Brand, Supplier } from '../../types';

const TAX_RATES = [0, 10.5, 21, 27];

// ── Filter select (native) ───────────────────────────────────────
function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className={clsx('appearance-none pl-3 pr-7 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/30',
          value ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 text-indigo-700 dark:text-indigo-400'
                : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-gray-300')}>
        <option value="">{label}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
    </div>
  );
}

// ── Searchable select ────────────────────────────────────────────
function FilterSearchSelect({ placeholder, value, onChange, options }: {
  placeholder: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className={clsx('flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-xs font-medium rounded-lg border transition-all duration-150 min-w-[120px]',
          value ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 text-indigo-700 dark:text-indigo-400'
                : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-gray-300')}>
        <span className="flex-1 text-left truncate max-w-[140px]">{selected ? selected.label : placeholder}</span>
        {value
          ? <X className="w-3 h-3 shrink-0 opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); onChange(''); }} />
          : <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg w-56 overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-slate-700">
            <input autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…"
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? <p className="px-3 py-2 text-xs text-gray-400">Sin resultados</p>
              : filtered.map((o) => (
                <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}
                  className={clsx('w-full text-left px-3 py-2 text-xs transition-colors',
                    o.value === value ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-medium'
                                      : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700')}>
                  {o.label}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Apply-field row (checkbox + control) ─────────────────────────
function ApplyRow({ enabled, onToggle, label, children }: {
  enabled: boolean; onToggle: (v: boolean) => void; label: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <label className="flex items-center gap-2 w-40 shrink-0 cursor-pointer select-none">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="w-3.5 h-3.5 rounded text-indigo-600" />
        <span className={clsx('text-xs font-medium', enabled ? 'text-gray-800 dark:text-slate-200' : 'text-gray-400 dark:text-slate-500')}>{label}</span>
      </label>
      <div className={clsx('flex-1', !enabled && 'opacity-40 pointer-events-none')}>{children}</div>
    </div>
  );
}

const ctrlCls = 'w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400';

// ── Main page ─────────────────────────────────────────────────────
export default function BulkProductUpdatePage() {
  const navigate = useNavigate();

  // Filters
  const [supplierId, setSupplierId] = useState('');
  const [rubroId, setRubroId]       = useState('');
  const [subrubroId, setSubrubroId] = useState('');
  const [brandId, setBrandId]       = useState('');
  const [search, setSearch]         = useState('');

  // Options
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rubros, setRubros]       = useState<Rubro[]>([]);
  const [brands, setBrands]       = useState<Brand[]>([]);

  const rootRubros = useMemo(() => rubros.filter((c) => !c.parentId), [rubros]);
  const subrubros  = useMemo(() => (rubroId ? rubros.filter((c) => c.parentId === rubroId) : []), [rubros, rubroId]);

  // Products + selection
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving]   = useState(false);

  // Changes to apply
  const [changeBrand, setChangeBrand]   = useState(false);
  const [applyBrandId, setApplyBrandId] = useState('');
  const [changeTax, setChangeTax]       = useState(false);
  const [applyTaxRate, setApplyTaxRate] = useState(21);
  const [changeRubro, setChangeRubro]   = useState(false);
  const [applyRubroId, setApplyRubroId] = useState('');
  const [applySubrubroId, setApplySubrubroId] = useState('');
  const [changeStatus, setChangeStatus] = useState(false);
  const [applyActive, setApplyActive]   = useState(true);

  const applyRubroChildren = useMemo(
    () => (applyRubroId ? rubros.filter((c) => c.parentId === applyRubroId) : []),
    [rubros, applyRubroId],
  );

  useEffect(() => {
    Promise.all([
      suppliersService.getAll({ limit: 200, isActive: true }),
      rubrosService.getAll(),
      brandsService.getAll(),
    ]).then(([s, r, b]) => { setSuppliers(s.data); setRubros(r); setBrands(b); }).catch(() => {});
  }, []);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const apiRubroId = subrubroId || (!subrubroId && subrubros.length === 0 ? rubroId : undefined);
      const [result, supplierProds] = await Promise.all([
        productsService.getAll({ limit: 500, rubroId: apiRubroId || undefined, brandId: brandId || undefined }),
        supplierId ? suppliersService.getProducts(supplierId) : Promise.resolve(null),
      ]);
      let filtered = result.data;
      if (rubroId && !subrubroId && subrubros.length > 0) {
        const allowed = new Set([rubroId, ...subrubros.map((c) => c.id)]);
        filtered = filtered.filter((p) => p.rubroId != null && allowed.has(p.rubroId));
      }
      if (supplierProds) {
        const ids = new Set(supplierProds.map((p) => p.id));
        filtered = filtered.filter((p) => ids.has(p.id));
      }
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
      }
      setProducts(filtered);
      setSelected((prev) => new Set([...prev].filter((id) => filtered.some((p) => p.id === id))));
    } catch {
      toast.error('Error al cargar productos');
    } finally {
      setIsLoading(false);
    }
  }, [supplierId, rubroId, subrubroId, subrubros, brandId, search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const allSelected = products.length > 0 && products.every((p) => selected.has(p.id));
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(products.map((p) => p.id)));

  const hasChanges = changeBrand || changeTax || changeRubro || changeStatus;

  const handleSave = async () => {
    if (selected.size === 0) { toast.error('Seleccioná al menos un producto'); return; }
    if (!hasChanges)         { toast.error('Activá al menos un campo a actualizar'); return; }
    const data: { brandId?: string | null; taxRate?: number; rubroId?: string | null; isActive?: boolean } = {};
    if (changeBrand)  data.brandId  = applyBrandId || null;
    if (changeTax)    data.taxRate  = applyTaxRate;
    if (changeRubro)  data.rubroId  = (applySubrubroId || applyRubroId) || null;
    if (changeStatus) data.isActive = applyActive;

    setIsSaving(true);
    try {
      const res = await productsService.bulkUpdate([...selected], data);
      toast.success(`${res.updated} producto(s) actualizado(s)`);
      setSelected(new Set());
      loadProducts();
    } catch {
      toast.error('Error al actualizar productos');
    } finally {
      setIsSaving(false);
    }
  };

  const brandName = (p: Product) => p.brand?.name ?? '—';
  const rubroName = (p: Product) => p.rubro?.name ?? '—';

  return (
    <div>
      <PageHeader
        title="Actualización masiva de productos"
        subtitle="Cambiá marca, alícuota, rubro/subrubro o estado por lote"
        backTo="/products"
        actions={
          <Button onClick={handleSave} isLoading={isSaving} disabled={selected.size === 0 || !hasChanges}>
            <Save className="w-4 h-4 mr-2" /> Aplicar a {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
          </Button>
        }
      />

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 mb-4 flex flex-wrap gap-3 items-center">
        <FilterSelect label="Proveedor" value={supplierId} onChange={setSupplierId} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
        <FilterSearchSelect placeholder="Rubro" value={rubroId} onChange={(id) => { setRubroId(id); setSubrubroId(''); }} options={rootRubros.map((c) => ({ value: c.id, label: c.name }))} />
        {subrubros.length > 0 && (
          <FilterSearchSelect placeholder="Subrubro" value={subrubroId} onChange={setSubrubroId} options={subrubros.map((c) => ({ value: c.id, label: c.name }))} />
        )}
        <FilterSelect label="Marca" value={brandId} onChange={setBrandId} options={brands.map((b) => ({ value: b.id, label: b.name }))} />
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar nombre o SKU…" className="w-56" />
        <button onClick={loadProducts} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20" title="Recargar">
          <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Changes to apply */}
      <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl px-4 py-3 mb-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">
          <Wand2 className="w-3.5 h-3.5" /> Cambios a aplicar a los seleccionados
        </p>
        <ApplyRow enabled={changeBrand} onToggle={setChangeBrand} label="Marca">
          <select className={ctrlCls} value={applyBrandId} onChange={(e) => setApplyBrandId(e.target.value)}>
            <option value="">(sin marca)</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </ApplyRow>
        <ApplyRow enabled={changeTax} onToggle={setChangeTax} label="Alícuota IVA">
          <select className={ctrlCls} value={applyTaxRate} onChange={(e) => setApplyTaxRate(parseFloat(e.target.value))}>
            {TAX_RATES.map((t) => <option key={t} value={t}>{t === 0 ? 'Exento / 0%' : `${t}%`}</option>)}
          </select>
        </ApplyRow>
        <ApplyRow enabled={changeRubro} onToggle={setChangeRubro} label="Rubro / Subrubro">
          <div className="flex gap-2">
            <select className={ctrlCls} value={applyRubroId} onChange={(e) => { setApplyRubroId(e.target.value); setApplySubrubroId(''); }}>
              <option value="">(sin rubro)</option>
              {rootRubros.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className={ctrlCls} value={applySubrubroId} onChange={(e) => setApplySubrubroId(e.target.value)} disabled={applyRubroChildren.length === 0}>
              <option value="">{applyRubroChildren.length === 0 ? '(sin subrubro)' : 'Subrubro…'}</option>
              {applyRubroChildren.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </ApplyRow>
        <ApplyRow enabled={changeStatus} onToggle={setChangeStatus} label="Estado">
          <select className={ctrlCls} value={applyActive ? '1' : '0'} onChange={(e) => setApplyActive(e.target.value === '1')}>
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </select>
        </ApplyRow>
      </div>

      {/* Products table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[32px_1fr_140px_140px_70px_80px] gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-slate-700 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
          <button onClick={toggleAll} className="flex items-center justify-center hover:text-indigo-600">
            {allSelected ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
          </button>
          <span>Producto</span>
          <span>Marca</span>
          <span>Rubro</span>
          <span className="text-right">IVA</span>
          <span className="text-center">Estado</span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">Cargando…</div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Sin productos</p>
            <p className="text-xs text-gray-400">Ajustá los filtros para cargar productos</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-slate-700/50 max-h-[55vh] overflow-y-auto">
            {products.map((p) => {
              const sel = selected.has(p.id);
              return (
                <div key={p.id} onClick={() => toggle(p.id)}
                  className={clsx('grid grid-cols-[32px_1fr_140px_140px_70px_80px] gap-3 px-4 py-2.5 items-center cursor-pointer transition-colors',
                    sel ? 'bg-indigo-50/60 dark:bg-indigo-900/10' : 'hover:bg-gray-50 dark:hover:bg-slate-700/30')}>
                  <button className="flex items-center justify-center text-gray-400 hover:text-indigo-600">
                    {sel ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate leading-tight">{p.name}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 font-mono">{p.sku}</p>
                  </div>
                  <span className="text-xs text-gray-600 dark:text-slate-400 truncate">{brandName(p)}</span>
                  <span className="text-xs text-gray-600 dark:text-slate-400 truncate">{rubroName(p)}</span>
                  <span className="text-xs text-right tabular-nums text-gray-600 dark:text-slate-400">{Number(p.taxRate)}%</span>
                  <span className="text-center">
                    <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full',
                      p.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                 : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400')}>
                      {p.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && products.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
            <span className="text-xs text-gray-400 dark:text-slate-500">
              {products.length} producto{products.length !== 1 ? 's' : ''} · {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
            </span>
            <Button onClick={handleSave} isLoading={isSaving} disabled={selected.size === 0 || !hasChanges} size="sm">
              <Save className="w-3.5 h-3.5 mr-1.5" /> Aplicar cambios
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
