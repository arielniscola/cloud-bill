import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Download, Sliders, ArrowLeftRight, Search,
  Plus, Minus, AlertTriangle, Package, X, RefreshCw,
} from 'lucide-react';
import { Badge, Button, Modal, Input, Select } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { stockService, warehousesService } from '../../services';
import { formatNumber, formatCurrency } from '../../utils/formatters';
import type { Stock, Warehouse } from '../../types';

// ── Types ──────────────────────────────────────────────────────────
type Tab = 'list' | 'by_warehouse';
type StockStatus = 'out_of_stock' | 'low_stock' | 'with_reserves' | 'normal' | 'no_minimum';

// ── Helpers ────────────────────────────────────────────────────────
function getStatus(stock: Stock): 'out_of_stock' | 'low_stock' | 'with_reserves' | 'normal' {
  const avail = Number(stock.quantity) - Number(stock.reservedQuantity);
  if (avail <= 0) return 'out_of_stock';
  if (stock.minQuantity !== null && avail < Number(stock.minQuantity)) return 'low_stock';
  if (Number(stock.reservedQuantity) > 0) return 'with_reserves';
  return 'normal';
}

const STATUS_LABEL: Record<string, string> = {
  out_of_stock: 'Sin stock',
  low_stock: 'Stock bajo',
  with_reserves: 'Con reservas',
  normal: 'Normal',
};

const STATUS_BADGE: Record<string, 'error' | 'warning' | 'info' | 'success'> = {
  out_of_stock: 'error',
  low_stock: 'warning',
  with_reserves: 'info',
  normal: 'success',
};

const ROW_CLASS: Record<string, string> = {
  out_of_stock: 'bg-red-50/70 dark:bg-red-900/20 hover:bg-red-100/50 dark:hover:bg-red-900/30',
  low_stock: 'bg-amber-50/50 dark:bg-amber-900/20 hover:bg-amber-100/40 dark:hover:bg-amber-900/30',
  with_reserves: 'bg-sky-50/30 dark:bg-sky-900/20 hover:bg-sky-100/30 dark:hover:bg-sky-900/30',
  normal: 'hover:bg-gray-50/70 dark:hover:bg-slate-700',
};

// ── Skeleton ───────────────────────────────────────────────────────
function SkeletonRow({ cols = 10 }: { cols?: number }) {
  return (
    <tr className="border-b border-gray-100 dark:border-slate-700 animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded" style={{ width: `${40 + (i % 3) * 20}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────
export default function StockPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('list');

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  // Filters — list tab
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');

  // "Por depósito" tab
  const [allWarehouseStocks, setAllWarehouseStocks] = useState<Map<string, Stock[]>>(new Map());
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const allLoadedRef = useRef(false);
  const [byWarehouseSearch, setByWarehouseSearch] = useState('');
  const [byWarehouseCategoryFilter, setByWarehouseCategoryFilter] = useState('');
  const [byWarehouseBrandFilter, setByWarehouseBrandFilter] = useState('');

  // Quick-adjust modal
  const [adjustStock, setAdjustStock] = useState<Stock | null>(null);
  const [adjustType, setAdjustType] = useState<'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'>('ADJUSTMENT_IN');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [isSavingAdjust, setIsSavingAdjust] = useState(false);

  // Min-qty modal
  const [minQtyStock, setMinQtyStock] = useState<Stock | null>(null);
  const [minQtyValue, setMinQtyValue] = useState('');
  const [isSavingMinQty, setIsSavingMinQty] = useState(false);

  // ── Data fetching ────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await warehousesService.getAll();
        setWarehouses(data);
        if (data.length > 0) {
          const def = data.find((w: Warehouse) => w.isDefault) ?? data[0];
          setSelectedWarehouse(def.id);
        }
      } catch {
        toast.error('Error al cargar almacenes');
      }
    })();
  }, []);

  const fetchStock = useCallback(async () => {
    if (!selectedWarehouse) return;
    setIsLoading(true);
    setStocks([]);
    try {
      const data = await stockService.getWarehouseStock(selectedWarehouse);
      setStocks(data);
    } catch {
      toast.error('Error al cargar stock');
    } finally {
      setIsLoading(false);
      setIsFirstLoad(false);
    }
  }, [selectedWarehouse]);

  useEffect(() => { fetchStock(); }, [fetchStock]);

  useEffect(() => {
    setCategoryFilter('');
    setBrandFilter('');
  }, [selectedWarehouse]);

  // Load all warehouses for the "Por depósito" tab
  const loadAllWarehouseStocks = useCallback(async () => {
    if (warehouses.length === 0) return;
    setIsLoadingAll(true);
    try {
      const results = await Promise.all(
        warehouses.map(async (w) => {
          const data = await stockService.getWarehouseStock(w.id);
          return [w.id, data] as [string, Stock[]];
        })
      );
      setAllWarehouseStocks(new Map(results));
      allLoadedRef.current = true;
    } catch {
      toast.error('Error al cargar stock por depósito');
    } finally {
      setIsLoadingAll(false);
    }
  }, [warehouses]);

  useEffect(() => {
    if (activeTab === 'by_warehouse' && !allLoadedRef.current && warehouses.length > 0) {
      loadAllWarehouseStocks();
    }
  }, [activeTab, warehouses, loadAllWarehouseStocks]);

  // ── Computed — list tab ─────────────────────────────────────────
  const categoriesInStock = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of stocks) {
      const cat = s.product?.category;
      if (cat) seen.set(cat.id, cat.name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [stocks]);

  const brandsInStock = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of stocks) {
      const brand = s.product?.brand;
      if (brand) seen.set(brand.id, brand.name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [stocks]);

  const stats = useMemo(() => {
    let outOfStock = 0, lowStock = 0, totalValue = 0;
    for (const s of stocks) {
      const avail = Number(s.quantity) - Number(s.reservedQuantity);
      if (avail <= 0) outOfStock++;
      else if (s.minQuantity !== null && avail < Number(s.minQuantity)) lowStock++;
      totalValue += Number(s.quantity) * Number(s.product?.cost ?? 0);
    }
    return { outOfStock, lowStock, totalValue, total: stocks.length };
  }, [stocks]);

  const displayedStocks = useMemo(() => {
    let result = stocks;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (s) =>
          s.product?.sku?.toLowerCase().includes(q) ||
          s.product?.name?.toLowerCase().includes(q) ||
          s.product?.barcode?.toLowerCase().includes(q) ||
          s.product?.brand?.name?.toLowerCase().includes(q)
      );
    }

    if (statusFilter === 'no_minimum') {
      result = result.filter((s) => s.minQuantity === null);
    } else if (statusFilter === 'low_stock') {
      result = result.filter((s) => {
        const avail = Number(s.quantity) - Number(s.reservedQuantity);
        return s.minQuantity !== null && avail > 0 && avail < Number(s.minQuantity);
      });
    } else if (statusFilter === 'out_of_stock') {
      result = result.filter((s) => Number(s.quantity) - Number(s.reservedQuantity) <= 0);
    } else if (statusFilter === 'with_reserves') {
      result = result.filter((s) => Number(s.reservedQuantity) > 0);
    } else if (statusFilter === 'normal') {
      result = result.filter((s) => {
        const avail = Number(s.quantity) - Number(s.reservedQuantity);
        return avail > 0 && (s.minQuantity === null || avail >= Number(s.minQuantity));
      });
    }

    if (categoryFilter) result = result.filter((s) => s.product?.category?.id === categoryFilter);
    if (brandFilter) result = result.filter((s) => s.product?.brandId === brandFilter);

    return [...result].sort((a, b) => {
      const availA = Number(a.quantity) - Number(a.reservedQuantity);
      const availB = Number(b.quantity) - Number(b.reservedQuantity);
      const priority = (s: Stock, avail: number) =>
        avail <= 0 ? 0 : s.minQuantity !== null && avail < Number(s.minQuantity) ? 1 : 2;
      const pA = priority(a, availA), pB = priority(b, availB);
      if (pA !== pB) return pA - pB;
      return availA - availB;
    });
  }, [stocks, search, statusFilter, categoryFilter, brandFilter]);

  const hasActiveFilters = !!(search || statusFilter || categoryFilter || brandFilter);
  const clearFilters = () => { setSearch(''); setStatusFilter(''); setCategoryFilter(''); setBrandFilter(''); };

  // ── Computed — "por depósito" tab ───────────────────────────────
  type PivotRow = {
    productId: string;
    name: string;
    sku: string | undefined;
    category: string | undefined;
    brand: string | undefined;
    brandId: string | undefined;
    categoryId: string | undefined;
    warehouseData: Map<string, { available: number; qty: number; reserved: number; minQty: number | null }>;
    totalAvailable: number;
  };

  const pivotRows = useMemo<PivotRow[]>(() => {
    const map = new Map<string, PivotRow>();
    for (const [warehouseId, wStocks] of allWarehouseStocks) {
      for (const s of wStocks) {
        if (!s.product) continue;
        if (!map.has(s.productId)) {
          map.set(s.productId, {
            productId: s.productId,
            name: s.product.name,
            sku: s.product.sku,
            category: s.product.category?.name,
            categoryId: s.product.category?.id,
            brand: s.product.brand?.name,
            brandId: s.product.brandId ?? undefined,
            warehouseData: new Map(),
            totalAvailable: 0,
          });
        }
        const row = map.get(s.productId)!;
        const qty = Number(s.quantity);
        const reserved = Number(s.reservedQuantity);
        const available = qty - reserved;
        row.warehouseData.set(warehouseId, { available, qty, reserved, minQty: s.minQuantity !== null ? Number(s.minQuantity) : null });
        row.totalAvailable += available;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allWarehouseStocks]);

  const allCategoriesInPivot = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of pivotRows) if (r.categoryId && r.category) seen.set(r.categoryId, r.category);
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [pivotRows]);

  const allBrandsInPivot = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of pivotRows) if (r.brandId && r.brand) seen.set(r.brandId, r.brand);
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [pivotRows]);

  const filteredPivotRows = useMemo(() => {
    let result = pivotRows;
    if (byWarehouseSearch.trim()) {
      const q = byWarehouseSearch.trim().toLowerCase();
      result = result.filter((r) => r.name.toLowerCase().includes(q) || r.sku?.toLowerCase().includes(q));
    }
    if (byWarehouseCategoryFilter) result = result.filter((r) => r.categoryId === byWarehouseCategoryFilter);
    if (byWarehouseBrandFilter) result = result.filter((r) => r.brandId === byWarehouseBrandFilter);
    return result;
  }, [pivotRows, byWarehouseSearch, byWarehouseCategoryFilter, byWarehouseBrandFilter]);

  const hasByWarehouseFilters = !!(byWarehouseSearch || byWarehouseCategoryFilter || byWarehouseBrandFilter);

  // ── Handlers ─────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const blob = await stockService.exportWarehouseStock(selectedWarehouse);
      const name = warehouses.find((w) => w.id === selectedWarehouse)?.name ?? 'stock';
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Error al exportar');
    }
  };

  const openAdjust = (stock: Stock) => {
    setAdjustStock(stock); setAdjustType('ADJUSTMENT_IN'); setAdjustQty(''); setAdjustReason('');
  };

  const handleAdjust = async () => {
    if (!adjustStock) return;
    const qty = parseFloat(adjustQty);
    if (!qty || qty <= 0) { toast.error('La cantidad debe ser mayor a 0'); return; }
    setIsSavingAdjust(true);
    try {
      await stockService.addMovement({
        productId: adjustStock.productId,
        warehouseId: adjustStock.warehouseId,
        type: adjustType,
        quantity: qty,
        reason: adjustReason || undefined,
      });
      toast.success('Ajuste registrado');
      setAdjustStock(null);
      fetchStock();
      if (allLoadedRef.current) { allLoadedRef.current = false; loadAllWarehouseStocks(); }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al ajustar');
    } finally {
      setIsSavingAdjust(false);
    }
  };

  const openMinQty = (stock: Stock) => {
    setMinQtyStock(stock);
    setMinQtyValue(stock.minQuantity !== null ? String(stock.minQuantity) : '');
  };

  const handleSaveMinQty = async () => {
    if (!minQtyStock) return;
    const parsed = minQtyValue === '' ? null : parseFloat(minQtyValue);
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) { toast.error('Ingrese un valor válido'); return; }
    setIsSavingMinQty(true);
    try {
      await stockService.setMinQuantity(minQtyStock.productId, minQtyStock.warehouseId, { minQuantity: parsed });
      toast.success('Stock mínimo actualizado');
      setMinQtyStock(null);
      fetchStock();
    } catch {
      toast.error('Error al actualizar stock mínimo');
    } finally {
      setIsSavingMinQty(false);
    }
  };

  const currentAvail = adjustStock ? Number(adjustStock.quantity) - Number(adjustStock.reservedQuantity) : 0;
  const adjustQtyNum = parseFloat(adjustQty) || 0;
  const newAvail = adjustType === 'ADJUSTMENT_IN' ? currentAvail + adjustQtyNum : currentAvail - adjustQtyNum;
  const currentWarehouseName = warehouses.find((w) => w.id === selectedWarehouse)?.name;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventario"
        subtitle={
          !isFirstLoad && currentWarehouseName && activeTab === 'list'
            ? `${stocks.length} SKUs · ${currentWarehouseName}`
            : undefined
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/stock/transfer')}>
              <ArrowLeftRight className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Transferir</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/stock/physical-count')}>
              <span className="hidden sm:inline">Conteo físico</span>
              <span className="sm:hidden">Conteo</span>
            </Button>
            {activeTab === 'list' && (
              <Button variant="outline" size="sm" onClick={handleExport} disabled={!selectedWarehouse}>
                <Download className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Exportar CSV</span>
              </Button>
            )}
          </div>
        }
      />

      {/* ── Stats strip (list tab only) ── */}
      {activeTab === 'list' && !isFirstLoad && stocks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
            <div className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{stats.total}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">SKUs en stock</div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
            <div className="text-xl font-bold text-gray-900 dark:text-white leading-none truncate">
              {formatCurrency(stats.totalValue, 'ARS')}
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Valor total</div>
          </div>
          <button
            onClick={() => setStatusFilter((f) => (f === 'low_stock' ? '' : 'low_stock'))}
            disabled={stats.lowStock === 0}
            className={`text-left rounded-xl px-4 py-3.5 border transition-all duration-150 active:scale-[0.98] ${
              stats.lowStock > 0
                ? statusFilter === 'low_stock'
                  ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 ring-1 ring-amber-300'
                  : 'bg-white dark:bg-slate-800 border-amber-200 hover:border-amber-300 hover:bg-amber-50/40'
                : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 cursor-default'
            }`}
          >
            <div className={`text-2xl font-bold leading-none flex items-center gap-1.5 ${stats.lowStock > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
              {stats.lowStock > 0 && <AlertTriangle className="w-4 h-4" />}
              {stats.lowStock}
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Stock bajo</div>
          </button>
          <button
            onClick={() => setStatusFilter((f) => (f === 'out_of_stock' ? '' : 'out_of_stock'))}
            disabled={stats.outOfStock === 0}
            className={`text-left rounded-xl px-4 py-3.5 border transition-all duration-150 active:scale-[0.98] ${
              stats.outOfStock > 0
                ? statusFilter === 'out_of_stock'
                  ? 'bg-red-50 dark:bg-red-900/30 border-red-300 ring-1 ring-red-300'
                  : 'bg-white dark:bg-slate-800 border-red-200 hover:border-red-300 hover:bg-red-50/40'
                : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 cursor-default'
            }`}
          >
            <div className={`text-2xl font-bold leading-none ${stats.outOfStock > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
              {stats.outOfStock}
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Sin stock</div>
          </button>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="flex gap-1 bg-gray-100 dark:bg-slate-700/60 p-1 rounded-xl w-fit">
        {([['list', 'Lista'], ['by_warehouse', 'Por depósito']] as [Tab, string][]).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              activeTab === tab
                ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TAB 1 — LISTA
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'list' && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
          {/* Filter bar */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-slate-700">
            <div className="flex flex-wrap gap-3 items-end">
              {/* Search */}
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="SKU, nombre, código de barras, marca..."
                    className="w-full pl-8 pr-3 py-[7px] text-sm bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg placeholder-gray-400 dark:placeholder:text-slate-500 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
                  />
                </div>
              </div>

              {/* Almacén */}
              <div className="w-44 shrink-0">
                <Select
                  label="Almacén"
                  options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                  value={selectedWarehouse}
                  onChange={setSelectedWarehouse}
                />
              </div>

              {/* Estado */}
              <div className="w-44 shrink-0">
                <Select
                  label="Estado"
                  options={[
                    { value: '', label: 'Todos' },
                    { value: 'low_stock', label: 'Stock bajo' },
                    { value: 'out_of_stock', label: 'Sin stock' },
                    { value: 'with_reserves', label: 'Con reservas' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'no_minimum', label: 'Sin mínimo definido' },
                  ]}
                  value={statusFilter}
                  onChange={setStatusFilter}
                />
              </div>

              {categoriesInStock.length > 0 && (
                <div className="w-40 shrink-0">
                  <Select
                    label="Categoría"
                    options={[{ value: '', label: 'Todas' }, ...categoriesInStock.map((c) => ({ value: c.id, label: c.name }))]}
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                  />
                </div>
              )}

              {brandsInStock.length > 0 && (
                <div className="w-36 shrink-0">
                  <Select
                    label="Marca"
                    options={[{ value: '', label: 'Todas' }, ...brandsInStock.map((b) => ({ value: b.id, label: b.name }))]}
                    value={brandFilter}
                    onChange={setBrandFilter}
                  />
                </div>
              )}

              {hasActiveFilters && (
                <div className="self-end">
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 px-2.5 py-[7px] rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-[background-color,color] duration-150 whitespace-nowrap"
                  >
                    <X className="w-3.5 h-3.5" />
                    Limpiar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-gray-50/80 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">SKU</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Producto</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Precio venta</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Costo</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Total</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Reservado</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Disponible</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Valor stock</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Mínimo</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Estado</th>
                  <th className="px-4 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={11} />)
                ) : displayedStocks.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-14 text-center">
                      <div className="flex flex-col items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                          <Package className="w-5 h-5 text-gray-400 dark:text-slate-500" />
                        </div>
                        <p className="text-sm font-medium text-gray-600 dark:text-slate-400">
                          {stocks.length === 0 ? 'Sin stock registrado en este almacén' : 'Sin resultados para los filtros aplicados'}
                        </p>
                        {hasActiveFilters && (
                          <button onClick={clearFilters} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-0.5">
                            Limpiar filtros
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedStocks.map((stock) => {
                    const available = Number(stock.quantity) - Number(stock.reservedQuantity);
                    const status = getStatus(stock);
                    const isLow = status === 'low_stock';
                    const category = stock.product?.category;
                    const brand = stock.product?.brand;
                    const stockValue = Number(stock.quantity) * Number(stock.product?.cost ?? 0);

                    return (
                      <tr key={stock.id} className={`transition-colors duration-100 ${ROW_CLASS[status]}`}>
                        {/* SKU */}
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                            {stock.product?.sku ?? '—'}
                          </span>
                        </td>

                        {/* Producto + categoría + marca */}
                        <td className="px-4 py-3 max-w-[220px]">
                          <div className="font-medium text-gray-900 dark:text-white leading-tight truncate">
                            {stock.product?.name ?? '—'}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {category && (
                              <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded-full leading-none">
                                {category.name}
                              </span>
                            )}
                            {brand && (
                              <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded-full leading-none">
                                {brand.name}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Precio venta */}
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-slate-300 text-xs">
                          {stock.product?.price != null ? formatCurrency(Number(stock.product.price), 'ARS') : <span className="text-gray-300 dark:text-slate-600">—</span>}
                        </td>

                        {/* Costo */}
                        <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-slate-400 text-xs">
                          {stock.product?.cost != null ? formatCurrency(Number(stock.product.cost), 'ARS') : <span className="text-gray-300 dark:text-slate-600">—</span>}
                        </td>

                        {/* Total */}
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-slate-400 tabular-nums">
                          {formatNumber(Number(stock.quantity), 0)}
                        </td>

                        {/* Reservado */}
                        <td className="px-4 py-3 text-right tabular-nums">
                          {Number(stock.reservedQuantity) > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                              {formatNumber(Number(stock.reservedQuantity), 0)}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-slate-600">—</span>
                          )}
                        </td>

                        {/* Disponible */}
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className={`font-bold ${available <= 0 ? 'text-red-600 dark:text-red-400' : isLow ? 'text-amber-600 dark:text-amber-400' : 'text-green-700 dark:text-emerald-400'}`}>
                            {formatNumber(available, 0)}
                          </span>
                        </td>

                        {/* Valor stock */}
                        <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-slate-400 text-xs">
                          {stockValue > 0 ? formatCurrency(stockValue, 'ARS') : <span className="text-gray-300 dark:text-slate-600">—</span>}
                        </td>

                        {/* Mínimo */}
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => openMinQty(stock)}
                            title="Editar stock mínimo"
                            className={`tabular-nums hover:underline ${isLow ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-500 dark:text-slate-400'}`}
                          >
                            {stock.minQuantity !== null ? (
                              <span className="flex items-center justify-end gap-1">
                                {isLow && <AlertTriangle className="w-3 h-3 flex-shrink-0" />}
                                {formatNumber(Number(stock.minQuantity), 0)}
                              </span>
                            ) : (
                              <span className="text-gray-300 dark:text-slate-600">—</span>
                            )}
                          </button>
                        </td>

                        {/* Estado */}
                        <td className="px-4 py-3 text-center">
                          <Badge variant={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge>
                        </td>

                        {/* Ajustar */}
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => openAdjust(stock)}
                            title="Ajustar stock"
                            className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-[background-color,color] duration-150 active:scale-[0.95]"
                          >
                            <Sliders className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {!isLoading && stocks.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
              <span className="text-xs text-gray-400 dark:text-slate-500">
                {displayedStocks.length === stocks.length
                  ? `${stocks.length} SKUs`
                  : `${displayedStocks.length} de ${stocks.length} SKUs`}
              </span>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 2 — POR DEPÓSITO
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'by_warehouse' && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
          {/* Filter bar */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-slate-700">
            <div className="flex flex-wrap gap-3 items-end">
              {/* Search */}
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    value={byWarehouseSearch}
                    onChange={(e) => setByWarehouseSearch(e.target.value)}
                    placeholder="SKU o nombre de producto..."
                    className="w-full pl-8 pr-3 py-[7px] text-sm bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg placeholder-gray-400 dark:placeholder:text-slate-500 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
                  />
                </div>
              </div>

              {allCategoriesInPivot.length > 0 && (
                <div className="w-40 shrink-0">
                  <Select
                    label="Categoría"
                    options={[{ value: '', label: 'Todas' }, ...allCategoriesInPivot.map((c) => ({ value: c.id, label: c.name }))]}
                    value={byWarehouseCategoryFilter}
                    onChange={setByWarehouseCategoryFilter}
                  />
                </div>
              )}

              {allBrandsInPivot.length > 0 && (
                <div className="w-36 shrink-0">
                  <Select
                    label="Marca"
                    options={[{ value: '', label: 'Todas' }, ...allBrandsInPivot.map((b) => ({ value: b.id, label: b.name }))]}
                    value={byWarehouseBrandFilter}
                    onChange={setByWarehouseBrandFilter}
                  />
                </div>
              )}

              {hasByWarehouseFilters && (
                <div className="self-end">
                  <button
                    onClick={() => { setByWarehouseSearch(''); setByWarehouseCategoryFilter(''); setByWarehouseBrandFilter(''); }}
                    className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 px-2.5 py-[7px] rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-[background-color,color] duration-150 whitespace-nowrap"
                  >
                    <X className="w-3.5 h-3.5" />
                    Limpiar
                  </button>
                </div>
              )}

              <div className="self-end ml-auto">
                <button
                  onClick={() => { allLoadedRef.current = false; loadAllWarehouseStocks(); }}
                  disabled={isLoadingAll}
                  className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 px-2.5 py-[7px] rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-[background-color,color] duration-150 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAll ? 'animate-spin' : ''}`} />
                  Actualizar
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: `${400 + warehouses.length * 110}px` }}>
              <thead className="bg-gray-50/80 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">SKU</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Producto</th>
                  {warehouses.map((w) => (
                    <th key={w.id} className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      {w.name}
                      {w.isDefault && (
                        <span className="ml-1 text-[9px] font-normal text-indigo-400 dark:text-indigo-500 normal-case">(principal)</span>
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {isLoadingAll ? (
                  Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} cols={2 + warehouses.length + 1} />)
                ) : filteredPivotRows.length === 0 ? (
                  <tr>
                    <td colSpan={2 + warehouses.length + 1} className="px-4 py-14 text-center">
                      <div className="flex flex-col items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                          <Package className="w-5 h-5 text-gray-400 dark:text-slate-500" />
                        </div>
                        <p className="text-sm font-medium text-gray-600 dark:text-slate-400">
                          {pivotRows.length === 0 ? 'Sin stock registrado' : 'Sin resultados para los filtros aplicados'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredPivotRows.map((row) => {
                    const isAllOut = row.totalAvailable <= 0;
                    const isAnyLow = warehouses.some((w) => {
                      const wd = row.warehouseData.get(w.id);
                      return wd && wd.minQty !== null && wd.available > 0 && wd.available < wd.minQty;
                    });

                    return (
                      <tr
                        key={row.productId}
                        className={`transition-colors duration-100 ${
                          isAllOut
                            ? 'bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20'
                            : isAnyLow
                            ? 'bg-amber-50/40 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                            : 'hover:bg-gray-50/70 dark:hover:bg-slate-700'
                        }`}
                      >
                        {/* SKU */}
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                            {row.sku ?? '—'}
                          </span>
                        </td>

                        {/* Producto */}
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="font-medium text-gray-900 dark:text-white leading-tight truncate">{row.name}</div>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {row.category && (
                              <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded-full leading-none">
                                {row.category}
                              </span>
                            )}
                            {row.brand && (
                              <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded-full leading-none">
                                {row.brand}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Per-warehouse cells */}
                        {warehouses.map((w) => {
                          const wd = row.warehouseData.get(w.id);
                          const avail = wd?.available ?? 0;
                          const hasStock = wd !== undefined;
                          const isOut = hasStock && avail <= 0;
                          const isLow = hasStock && wd!.minQty !== null && avail > 0 && avail < wd!.minQty!;

                          return (
                            <td key={w.id} className="px-4 py-3 text-center tabular-nums">
                              {!hasStock ? (
                                <span className="text-gray-200 dark:text-slate-700">—</span>
                              ) : (
                                <span className={`inline-flex flex-col items-center ${isOut ? 'text-red-600 dark:text-red-400 font-bold' : isLow ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-800 dark:text-slate-200'}`}>
                                  <span className="text-sm font-semibold">{formatNumber(avail, 0)}</span>
                                  {wd!.reserved > 0 && (
                                    <span className="text-[10px] text-amber-500 dark:text-amber-400 font-normal leading-none mt-0.5">
                                      {formatNumber(wd!.reserved, 0)} res.
                                    </span>
                                  )}
                                </span>
                              )}
                            </td>
                          );
                        })}

                        {/* Total disponible */}
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm font-bold tabular-nums ${isAllOut ? 'text-red-600 dark:text-red-400' : isAnyLow ? 'text-amber-600 dark:text-amber-400' : 'text-green-700 dark:text-emerald-400'}`}>
                            {formatNumber(row.totalAvailable, 0)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {!isLoadingAll && pivotRows.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
              <span className="text-xs text-gray-400 dark:text-slate-500">
                {filteredPivotRows.length === pivotRows.length
                  ? `${pivotRows.length} productos`
                  : `${filteredPivotRows.length} de ${pivotRows.length} productos`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Modal: ajuste rápido ── */}
      <Modal isOpen={!!adjustStock} onClose={() => setAdjustStock(null)} title="Ajustar stock" size="sm">
        {adjustStock && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 rounded-xl px-4 py-3">
              <div className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{adjustStock.product?.name}</div>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500 dark:text-slate-400">
                <span>Total: <strong className="text-gray-800 dark:text-slate-200">{formatNumber(Number(adjustStock.quantity), 0)}</strong></span>
                {Number(adjustStock.reservedQuantity) > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">Reservado: <strong>{formatNumber(Number(adjustStock.reservedQuantity), 0)}</strong></span>
                )}
                <span className={currentAvail <= 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-green-700 dark:text-emerald-400 font-medium'}>
                  Disponible: <strong>{formatNumber(currentAvail, 0)}</strong>
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">Tipo de ajuste</label>
              <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-slate-600">
                <button type="button" onClick={() => setAdjustType('ADJUSTMENT_IN')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-[background-color,color] duration-150 ${adjustType === 'ADJUSTMENT_IN' ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}>
                  <Plus className="w-4 h-4" />Entrada
                </button>
                <button type="button" onClick={() => setAdjustType('ADJUSTMENT_OUT')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-[background-color,color] duration-150 border-l border-gray-200 dark:border-slate-600 ${adjustType === 'ADJUSTMENT_OUT' ? 'bg-red-500 text-white' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}>
                  <Minus className="w-4 h-4" />Salida
                </button>
              </div>
            </div>

            <Input label="Cantidad *" type="number" min="1" step="1" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} placeholder="0" autoFocus />

            {adjustQtyNum > 0 && (
              <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2.5 border ${newAvail < 0 ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400' : 'bg-gray-50 dark:bg-slate-700/50 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-300'}`}>
                <span className="text-xs text-gray-500 dark:text-slate-400">Disponible resultante:</span>
                <span className={`font-bold ${newAvail < 0 ? 'text-red-600 dark:text-red-400' : newAvail === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-700 dark:text-emerald-400'}`}>
                  {formatNumber(currentAvail, 0)} → {formatNumber(newAvail, 0)}
                </span>
                {newAvail < 0 && <span className="text-xs text-red-500 dark:text-red-400 ml-auto">Stock insuficiente</span>}
              </div>
            )}

            <Input label="Motivo" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Ej: corrección de inventario" />

            <div className="flex gap-2.5 pt-1">
              <Button onClick={handleAdjust} isLoading={isSavingAdjust}>Registrar ajuste</Button>
              <Button variant="outline" onClick={() => setAdjustStock(null)} disabled={isSavingAdjust}>Cancelar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal: stock mínimo ── */}
      <Modal isOpen={!!minQtyStock} onClose={() => setMinQtyStock(null)} title={`Stock mínimo — ${minQtyStock?.product?.name ?? ''}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed">
            Cuando el stock disponible caiga por debajo de este valor aparecerá una alerta. Dejalo vacío para deshabilitar.
          </p>
          <Input label="Stock mínimo" type="number" min="0" step="1" value={minQtyValue} onChange={(e) => setMinQtyValue(e.target.value)} placeholder="Sin mínimo" autoFocus />
          <div className="flex gap-2.5 pt-1">
            <Button onClick={handleSaveMinQty} isLoading={isSavingMinQty}>Guardar</Button>
            <Button variant="outline" onClick={() => setMinQtyStock(null)} disabled={isSavingMinQty}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
