import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Download, Sliders, ArrowLeftRight, Search,
  Plus, Minus, AlertTriangle, Package, X,
} from 'lucide-react';
import { Badge, Button, Modal, Input, Select } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { stockService, warehousesService } from '../../services';
import { formatNumber, formatCurrency } from '../../utils/formatters';
import type { Stock, Warehouse } from '../../types';

// ── Helpers ────────────────────────────────────────────────────────
type StockStatus = 'out_of_stock' | 'low_stock' | 'with_reserves' | 'normal';

function getStatus(stock: Stock): StockStatus {
  const avail = Number(stock.quantity) - Number(stock.reservedQuantity);
  if (avail <= 0) return 'out_of_stock';
  if (stock.minQuantity !== null && avail < Number(stock.minQuantity)) return 'low_stock';
  if (Number(stock.reservedQuantity) > 0) return 'with_reserves';
  return 'normal';
}

const STATUS_LABEL: Record<StockStatus, string> = {
  out_of_stock: 'Sin stock',
  low_stock: 'Stock bajo',
  with_reserves: 'Con reservas',
  normal: 'Normal',
};

const STATUS_BADGE: Record<StockStatus, 'error' | 'warning' | 'info' | 'success'> = {
  out_of_stock: 'error',
  low_stock: 'warning',
  with_reserves: 'info',
  normal: 'success',
};

const ROW_CLASS: Record<StockStatus, string> = {
  out_of_stock: 'bg-red-50/70 hover:bg-red-100/50',
  low_stock: 'bg-amber-50/50 hover:bg-amber-100/40',
  with_reserves: 'bg-sky-50/30 hover:bg-sky-100/30',
  normal: 'hover:bg-gray-50/70',
};

// ── Skeleton ───────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100 animate-pulse">
      <td className="px-4 py-3.5"><div className="h-3 bg-gray-100 rounded w-14" /></td>
      <td className="px-4 py-3.5">
        <div className="h-3 bg-gray-100 rounded w-44 mb-1.5" />
        <div className="h-2.5 bg-gray-100 rounded w-20" />
      </td>
      <td className="px-4 py-3.5 text-right"><div className="h-3 bg-gray-100 rounded w-10 ml-auto" /></td>
      <td className="px-4 py-3.5 text-right"><div className="h-3 bg-gray-100 rounded w-8 ml-auto" /></td>
      <td className="px-4 py-3.5 text-right"><div className="h-3 bg-gray-100 rounded w-10 ml-auto" /></td>
      <td className="px-4 py-3.5 text-right"><div className="h-3 bg-gray-100 rounded w-8 ml-auto" /></td>
      <td className="px-4 py-3.5"><div className="h-5 bg-gray-100 rounded-full w-20 mx-auto" /></td>
      <td className="px-4 py-3.5"><div className="w-7 h-7 bg-gray-100 rounded-lg mx-auto" /></td>
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────
export default function StockPage() {
  const navigate = useNavigate();

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  // Filters (all client-side)
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');

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
          const def = data.find((w) => w.isDefault) ?? data[0];
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

  // Reset dependent filters when warehouse changes
  useEffect(() => {
    setCategoryFilter('');
    setBrandFilter('');
  }, [selectedWarehouse]);

  // ── Computed ─────────────────────────────────────────────────────
  const categoriesInStock = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of stocks) {
      const cat = s.product?.category;
      if (cat) seen.set(cat.id, cat.name);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [stocks]);

  const brandsInStock = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of stocks) {
      const brand = s.product?.brand;
      if (brand) seen.set(brand.id, brand.name);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
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
          s.product?.barcode?.toLowerCase().includes(q)
      );
    }

    if (statusFilter === 'low_stock') {
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

    if (categoryFilter) {
      result = result.filter((s) => s.product?.category?.id === categoryFilter);
    }

    if (brandFilter) {
      result = result.filter((s) => s.product?.brandId === brandFilter);
    }

    // Sort: sin stock → stock bajo → resto (asc por disponible)
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
  const clearFilters = () => {
    setSearch(''); setStatusFilter(''); setCategoryFilter(''); setBrandFilter('');
  };

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
    setAdjustStock(stock);
    setAdjustType('ADJUSTMENT_IN');
    setAdjustQty('');
    setAdjustReason('');
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
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) {
      toast.error('Ingrese un valor válido (0 o mayor)'); return;
    }
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

  // Adjust preview
  const currentAvail = adjustStock
    ? Number(adjustStock.quantity) - Number(adjustStock.reservedQuantity)
    : 0;
  const adjustQtyNum = parseFloat(adjustQty) || 0;
  const newAvail = adjustType === 'ADJUSTMENT_IN' ? currentAvail + adjustQtyNum : currentAvail - adjustQtyNum;

  const currentWarehouseName = warehouses.find((w) => w.id === selectedWarehouse)?.name;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventario"
        subtitle={
          !isFirstLoad && currentWarehouseName
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
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!selectedWarehouse}>
              <Download className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Exportar CSV</span>
            </Button>
          </div>
        }
      />

      {/* ── Stats strip ── */}
      {!isFirstLoad && stocks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Total SKUs */}
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3.5">
            <div className="text-2xl font-bold text-gray-900 leading-none">{stats.total}</div>
            <div className="text-xs text-gray-500 mt-1">SKUs en stock</div>
          </div>

          {/* Valor inventario */}
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3.5">
            <div className="text-xl font-bold text-gray-900 leading-none truncate">
              {formatCurrency(stats.totalValue, 'ARS')}
            </div>
            <div className="text-xs text-gray-500 mt-1">Valor total</div>
          </div>

          {/* Stock bajo — clickable */}
          <button
            onClick={() => setStatusFilter((f) => (f === 'low_stock' ? '' : 'low_stock'))}
            disabled={stats.lowStock === 0}
            className={`text-left rounded-xl px-4 py-3.5 border transition-all duration-150 active:scale-[0.98] ${
              stats.lowStock > 0
                ? statusFilter === 'low_stock'
                  ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-300'
                  : 'bg-white border-amber-200 hover:border-amber-300 hover:bg-amber-50/40'
                : 'bg-white border-gray-200 cursor-default'
            }`}
          >
            <div className={`text-2xl font-bold leading-none flex items-center gap-1.5 ${stats.lowStock > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
              {stats.lowStock > 0 && <AlertTriangle className="w-4 h-4" />}
              {stats.lowStock}
            </div>
            <div className="text-xs text-gray-500 mt-1">Stock bajo</div>
          </button>

          {/* Sin stock — clickable */}
          <button
            onClick={() => setStatusFilter((f) => (f === 'out_of_stock' ? '' : 'out_of_stock'))}
            disabled={stats.outOfStock === 0}
            className={`text-left rounded-xl px-4 py-3.5 border transition-all duration-150 active:scale-[0.98] ${
              stats.outOfStock > 0
                ? statusFilter === 'out_of_stock'
                  ? 'bg-red-50 border-red-300 ring-1 ring-red-300'
                  : 'bg-white border-red-200 hover:border-red-300 hover:bg-red-50/40'
                : 'bg-white border-gray-200 cursor-default'
            }`}
          >
            <div className={`text-2xl font-bold leading-none ${stats.outOfStock > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {stats.outOfStock}
            </div>
            <div className="text-xs text-gray-500 mt-1">Sin stock</div>
          </button>
        </div>
      )}

      {/* ── Main card ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">

        {/* Filter bar */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex flex-wrap gap-3 items-end">

            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">Buscar</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="SKU, nombre o código de barras..."
                  className="w-full pl-8 pr-3 py-[7px] text-sm bg-gray-50 border border-gray-200 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
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
            <div className="w-40 shrink-0">
              <Select
                label="Estado"
                options={[
                  { value: '', label: 'Todos' },
                  { value: 'low_stock', label: 'Stock bajo' },
                  { value: 'out_of_stock', label: 'Sin stock' },
                  { value: 'with_reserves', label: 'Con reservas' },
                  { value: 'normal', label: 'Normal' },
                ]}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </div>

            {/* Categoría — solo si hay en el almacén actual */}
            {categoriesInStock.length > 0 && (
              <div className="w-40 shrink-0">
                <Select
                  label="Categoría"
                  options={[
                    { value: '', label: 'Todas' },
                    ...categoriesInStock.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                />
              </div>
            )}

            {/* Marca — solo si hay en el almacén actual */}
            {brandsInStock.length > 0 && (
              <div className="w-36 shrink-0">
                <Select
                  label="Marca"
                  options={[
                    { value: '', label: 'Todas' },
                    ...brandsInStock.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                  value={brandFilter}
                  onChange={setBrandFilter}
                />
              </div>
            )}

            {/* Limpiar filtros */}
            {hasActiveFilters && (
              <div className="self-end">
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-2.5 py-[7px] rounded-lg hover:bg-gray-100 transition-[background-color,color] duration-150 whitespace-nowrap"
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
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">SKU</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Producto</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Total</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Reservado</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Disponible</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Mínimo</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Estado</th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : displayedStocks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center">
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                        <Package className="w-5 h-5 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-600">
                        {stocks.length === 0
                          ? 'Sin stock registrado en este almacén'
                          : 'Sin resultados para los filtros aplicados'}
                      </p>
                      {hasActiveFilters && (
                        <button
                          onClick={clearFilters}
                          className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline mt-0.5"
                        >
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

                  return (
                    <tr
                      key={stock.id}
                      className={`transition-colors duration-100 ${ROW_CLASS[status]}`}
                    >
                      {/* SKU */}
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                          {stock.product?.sku ?? '—'}
                        </span>
                      </td>

                      {/* Producto + categoría */}
                      <td className="px-4 py-3.5 max-w-[240px]">
                        <div className="font-medium text-gray-900 leading-tight truncate">
                          {stock.product?.name ?? '—'}
                        </div>
                        {category && (
                          <span className="inline-block mt-0.5 text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full leading-none">
                            {category.name}
                          </span>
                        )}
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3.5 text-right text-gray-600 tabular-nums">
                        {formatNumber(Number(stock.quantity), 0)}
                      </td>

                      {/* Reservado */}
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {Number(stock.reservedQuantity) > 0 ? (
                          <span className="text-amber-600 font-medium">
                            {formatNumber(Number(stock.reservedQuantity), 0)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* Disponible */}
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        <span
                          className={`font-bold ${
                            available <= 0
                              ? 'text-red-600'
                              : isLow
                              ? 'text-amber-600'
                              : 'text-green-700'
                          }`}
                        >
                          {formatNumber(available, 0)}
                        </span>
                      </td>

                      {/* Mínimo — editable on click */}
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => openMinQty(stock)}
                          title="Editar stock mínimo"
                          className={`tabular-nums hover:underline ${
                            isLow ? 'text-amber-600 font-semibold' : 'text-gray-500'
                          }`}
                        >
                          {stock.minQuantity !== null ? (
                            <span className="flex items-center justify-end gap-1">
                              {isLow && <AlertTriangle className="w-3 h-3 flex-shrink-0" />}
                              {formatNumber(Number(stock.minQuantity), 0)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </button>
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3.5 text-center">
                        <Badge variant={STATUS_BADGE[status]}>
                          {STATUS_LABEL[status]}
                        </Badge>
                      </td>

                      {/* Ajustar */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => openAdjust(stock)}
                          title="Ajustar stock"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-[background-color,color] duration-150 active:scale-[0.95]"
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

        {/* Table footer */}
        {!isLoading && stocks.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {displayedStocks.length === stocks.length
                ? `${stocks.length} SKUs`
                : `${displayedStocks.length} de ${stocks.length} SKUs`}
            </span>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: ajuste rápido ── */}
      <Modal
        isOpen={!!adjustStock}
        onClose={() => setAdjustStock(null)}
        title="Ajustar stock"
        size="sm"
      >
        {adjustStock && (
          <div className="space-y-4">
            {/* Product info card */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <div className="font-semibold text-gray-900 text-sm leading-tight">
                {adjustStock.product?.name}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
                <span>
                  Total:{' '}
                  <strong className="text-gray-800">{formatNumber(Number(adjustStock.quantity), 0)}</strong>
                </span>
                {Number(adjustStock.reservedQuantity) > 0 && (
                  <span className="text-amber-600">
                    Reservado: <strong>{formatNumber(Number(adjustStock.reservedQuantity), 0)}</strong>
                  </span>
                )}
                <span className={currentAvail <= 0 ? 'text-red-600 font-medium' : 'text-green-700 font-medium'}>
                  Disponible: <strong>{formatNumber(currentAvail, 0)}</strong>
                </span>
              </div>
            </div>

            {/* Type toggle */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Tipo de ajuste</label>
              <div className="flex rounded-xl overflow-hidden border border-gray-200">
                <button
                  type="button"
                  onClick={() => setAdjustType('ADJUSTMENT_IN')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-[background-color,color] duration-150 ${
                    adjustType === 'ADJUSTMENT_IN'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  Entrada
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType('ADJUSTMENT_OUT')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-[background-color,color] duration-150 border-l border-gray-200 ${
                    adjustType === 'ADJUSTMENT_OUT'
                      ? 'bg-red-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Minus className="w-4 h-4" />
                  Salida
                </button>
              </div>
            </div>

            <Input
              label="Cantidad *"
              type="number"
              min="1"
              step="1"
              value={adjustQty}
              onChange={(e) => setAdjustQty(e.target.value)}
              placeholder="0"
              autoFocus
            />

            {/* Preview */}
            {adjustQtyNum > 0 && (
              <div
                className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2.5 border ${
                  newAvail < 0
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-gray-50 border-gray-200 text-gray-700'
                }`}
              >
                <span className="text-xs text-gray-500">Disponible resultante:</span>
                <span
                  className={`font-bold ${
                    newAvail < 0 ? 'text-red-600' : newAvail === 0 ? 'text-amber-600' : 'text-green-700'
                  }`}
                >
                  {formatNumber(currentAvail, 0)} → {formatNumber(newAvail, 0)}
                </span>
                {newAvail < 0 && (
                  <span className="text-xs text-red-500 ml-auto">Stock insuficiente</span>
                )}
              </div>
            )}

            <Input
              label="Motivo"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="Ej: corrección de inventario"
            />

            <div className="flex gap-2.5 pt-1">
              <Button onClick={handleAdjust} isLoading={isSavingAdjust}>
                Registrar ajuste
              </Button>
              <Button variant="outline" onClick={() => setAdjustStock(null)} disabled={isSavingAdjust}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal: stock mínimo ── */}
      <Modal
        isOpen={!!minQtyStock}
        onClose={() => setMinQtyStock(null)}
        title={`Stock mínimo — ${minQtyStock?.product?.name ?? ''}`}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500 leading-relaxed">
            Cuando el stock disponible caiga por debajo de este valor aparecerá una alerta.
            Dejalo vacío para deshabilitar.
          </p>
          <Input
            label="Stock mínimo"
            type="number"
            min="0"
            step="1"
            value={minQtyValue}
            onChange={(e) => setMinQtyValue(e.target.value)}
            placeholder="Sin mínimo"
            autoFocus
          />
          <div className="flex gap-2.5 pt-1">
            <Button onClick={handleSaveMinQty} isLoading={isSavingMinQty}>
              Guardar
            </Button>
            <Button variant="outline" onClick={() => setMinQtyStock(null)} disabled={isSavingMinQty}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
