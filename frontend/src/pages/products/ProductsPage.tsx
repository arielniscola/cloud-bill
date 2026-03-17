import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Package, ChevronDown, X, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card } from '../../components/ui';
import { PageHeader, DataTable, SearchInput, ConfirmDialog } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { productsService, categoriesService, brandsService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import { DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { Product, Category, Brand } from '../../types';

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

// ── Compact filter select ────────────────────────────────────────
function FilterSelect({
  label,
  value,
  onChange,
  options,
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
        className={`appearance-none pl-3 pr-7 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:placeholder:text-slate-500 ${
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
  value,
  onChange,
  options,
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
          {/* Search input */}
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

          {/* Options list */}
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

// ── Active filter chips ──────────────────────────────────────────
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full">
      {label}
      <button onClick={onRemove} className="hover:text-indigo-900 dark:hover:text-indigo-300 ml-0.5">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

type StatusFilter = 'all' | 'active' | 'inactive';

export default function ProductsPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  // Load categories & brands for filter dropdowns
  useEffect(() => {
    Promise.all([categoriesService.getAll(), brandsService.getAll()])
      .then(([cats, brnds]) => { setCategories(cats); setBrands(brnds); })
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
        categoryId: categoryFilter || undefined,
        brandId: brandFilter || undefined,
      });
      setProducts(response.data);
      setTotal(response.total);
    } catch {
      toast.error('Error al cargar productos');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, search, isActiveFilter, categoryFilter, brandFilter]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const resetPage = () => setPage(1);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await productsService.delete(deleteId);
      toast.success('Producto eliminado');
      setDeleteId(null);
      fetchProducts();
    } catch {
      toast.error('Error al eliminar producto');
    } finally {
      setIsDeleting(false);
    }
  };

  // Category options (flat with indent for subcategories)
  const categoryOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const roots = categories.filter((c) => !c.parentId);
    for (const root of roots) {
      opts.push({ value: root.id, label: root.name });
      for (const child of root.children ?? []) {
        opts.push({ value: child.id, label: `└ ${child.name}` });
      }
    }
    return opts;
  }, [categories]);

  const brandOptions = useMemo(
    () => brands.map((b) => ({ value: b.id, label: b.name })),
    [brands]
  );

  const activeFilterCount = [categoryFilter, brandFilter, statusFilter !== 'all'].filter(Boolean).length;

  const columns: Column<Product>[] = [
    {
      key: 'sku',
      header: 'Producto',
      render: (p) => (
        <div className="flex items-start gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono text-[10px] font-semibold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded flex-shrink-0">
                {p.sku}
              </span>
              {p.brand && (
                <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 px-1.5 py-0.5 rounded-full truncate max-w-[80px]">
                  {p.brand.name}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate leading-tight">{p.name}</p>
            {p.category && (
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 truncate leading-none">{p.category.name}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'cost',
      header: 'Costo',
      render: (p) => (
        <span className="text-sm text-gray-600 dark:text-slate-400">{formatCurrency(p.cost)}</span>
      ),
    },
    {
      key: 'price',
      header: 'Precio venta',
      render: (p) => (
        <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">{formatCurrency(p.price)}</span>
      ),
    },
    {
      key: 'margin',
      header: 'Margen',
      render: (p) => {
        const m = margin(p.cost, p.price);
        return m !== null
          ? <span className={`text-xs font-semibold ${marginColor(m)}`}>{m.toFixed(1)}%</span>
          : <span className="text-gray-300 dark:text-slate-600 text-xs">—</span>;
      },
    },
    {
      key: 'taxRate',
      header: 'IVA',
      render: (p) => (
        <span className="text-[11px] font-semibold bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 px-1.5 py-0.5 rounded-full">
          {p.taxRate}%
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Estado',
      render: (p) => (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${p.isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'}`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
          {p.isActive ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (p) => (
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            title="Editar"
            onClick={(e) => { e.stopPropagation(); navigate(`/products/${p.id}/edit`); }}
            className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-[background-color,color] duration-150"
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button
            title="Eliminar"
            onClick={(e) => { e.stopPropagation(); setDeleteId(p.id); }}
            className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-[background-color,color] duration-150"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const tabs: { id: StatusFilter; label: string }[] = [
    { id: 'all',      label: 'Todos' },
    { id: 'active',   label: 'Activos' },
    { id: 'inactive', label: 'Inactivos' },
  ];

  return (
    <div>
      <PageHeader
        title="Productos"
        subtitle={`${total} ${total === 1 ? 'producto' : 'productos'}${activeFilterCount > 0 ? ' · filtros activos' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/products/bulk-price-update')}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Actualizar precios
            </Button>
            <Button onClick={() => navigate('/products/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo producto
            </Button>
          </div>
        }
      />

      <Card padding="none">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status tabs */}
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

            {/* Category filter */}
            {categoryOptions.length > 0 && (
              <FilterSelect
                label="Categoría"
                value={categoryFilter}
                onChange={(v) => { setCategoryFilter(v); resetPage(); }}
                options={categoryOptions}
              />
            )}

            {/* Brand filter */}
            {brandOptions.length > 0 && (
              <BrandSearchSelect
                value={brandFilter}
                onChange={(v) => { setBrandFilter(v); resetPage(); }}
                options={brandOptions}
              />
            )}

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {categoryFilter && (
                  <FilterChip
                    label={categoryOptions.find((o) => o.value === categoryFilter)?.label ?? 'Categoría'}
                    onRemove={() => { setCategoryFilter(''); resetPage(); }}
                  />
                )}
                {brandFilter && (
                  <FilterChip
                    label={brandOptions.find((o) => o.value === brandFilter)?.label ?? 'Marca'}
                    onRemove={() => { setBrandFilter(''); resetPage(); }}
                  />
                )}
                {statusFilter !== 'all' && (
                  <FilterChip
                    label={statusFilter === 'active' ? 'Activos' : 'Inactivos'}
                    onRemove={() => { setStatusFilter('all'); resetPage(); }}
                  />
                )}
                <button
                  onClick={() => { setCategoryFilter(''); setBrandFilter(''); setStatusFilter('all'); resetPage(); }}
                  className="text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 underline ml-1"
                >
                  Limpiar todo
                </button>
              </div>
            )}
          </div>

          {/* Search */}
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); resetPage(); }}
            placeholder="Buscar por SKU, nombre…"
            className="w-64"
          />
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          data={products}
          isLoading={isLoading}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => navigate(`/products/${p.id}/edit`)}
          emptyMessage={
            search || activeFilterCount > 0
              ? 'Sin resultados para los filtros aplicados'
              : 'No hay productos registrados'
          }
          pagination={
            total > 0
              ? {
                  page,
                  totalPages: Math.ceil(total / limit),
                  limit,
                  total,
                  onPageChange: setPage,
                  onLimitChange: (l) => { setLimit(l); setPage(1); },
                }
              : undefined
          }
        />

        {/* Empty state */}
        {!isLoading && products.length === 0 && !search && activeFilterCount === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-4">
              <Package className="w-7 h-7 text-gray-300 dark:text-slate-600" />
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">Sin productos</p>
            <p className="text-sm text-gray-400 dark:text-slate-500 max-w-xs leading-relaxed mb-5">
              Creá tu catálogo de productos para usarlos en facturas, remitos y compras.
            </p>
            <Button onClick={() => navigate('/products/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo producto
            </Button>
          </div>
        )}
      </Card>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar producto"
        message="¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
