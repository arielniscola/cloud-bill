import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Edit, Package, AlertTriangle, DollarSign, Download,
  MapPin, Star, Search, Boxes, Tags, Filter,
  TrendingDown, BookLock, CheckCircle2,
} from 'lucide-react';
import { Card, Badge, Button } from '../../components/ui';
import { PageHeader, DataTable } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { stockService, warehousesService } from '../../services';
import { formatNumber, formatCurrency } from '../../utils/formatters';
import type { Stock, Warehouse } from '../../types';

// ── Types ────────────────────────────────────────────────────────
type FilterTab = 'all' | 'low' | 'reserved';

// ── Helpers ──────────────────────────────────────────────────────
function isLowStock(s: Stock) {
  return s.minQuantity !== null &&
    (Number(s.quantity) - Number(s.reservedQuantity)) < Number(s.minQuantity);
}

// ── Stock level bar ──────────────────────────────────────────────
function StockBar({ stock }: { stock: Stock }) {
  if (stock.minQuantity === null || Number(stock.minQuantity) === 0) return null;
  const available = Number(stock.quantity) - Number(stock.reservedQuantity);
  const min = Number(stock.minQuantity);
  const pct = Math.min(100, Math.max(0, (available / (min * 2)) * 100));
  const color = available < min ? 'bg-red-400' : available < min * 1.5 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon, colorClass, highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  colorClass: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'ring-1 ring-amber-200' : ''}>
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-xl flex-shrink-0 ${colorClass}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 leading-none mb-1">{label}</p>
          <p className="text-lg font-bold text-gray-900 leading-tight">{value}</p>
          {sub && <p className="text-[11px] text-gray-400 mt-0.5 leading-none">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

function StatSkeleton() {
  return (
    <Card>
      <div className="flex items-start gap-3 animate-pulse">
        <div className="w-10 h-10 bg-gray-100 rounded-xl flex-shrink-0" />
        <div className="flex-1">
          <div className="h-3 w-20 bg-gray-100 rounded mb-2" />
          <div className="h-5 w-14 bg-gray-100 rounded" />
        </div>
      </div>
    </Card>
  );
}

// ── Low stock panel ──────────────────────────────────────────────
function LowStockPanel({ items }: { items: Stock[] }) {
  if (items.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-amber-200 bg-amber-100/60">
        <div className="w-7 h-7 rounded-lg bg-amber-200 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-800 leading-none">
            {items.length} {items.length === 1 ? 'producto bajo stock mínimo' : 'productos bajo stock mínimo'}
          </p>
          <p className="text-xs text-amber-600 mt-0.5 leading-none">Requieren reposición</p>
        </div>
      </div>
      {/* List */}
      <div className="divide-y divide-amber-100">
        {items.map((s) => {
          const available = Number(s.quantity) - Number(s.reservedQuantity);
          const min = Number(s.minQuantity!);
          const deficit = min - available;
          return (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="font-mono text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded flex-shrink-0">
                {s.product?.sku ?? '—'}
              </span>
              <span className="text-sm text-amber-900 flex-1 truncate">{s.product?.name}</span>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  <p className="text-xs font-bold text-red-600 leading-none">
                    {formatNumber(available, 0)}
                    <span className="text-amber-500 font-normal"> / {formatNumber(min, 0)}</span>
                  </p>
                  <p className="text-[10px] text-amber-500 mt-0.5 leading-none">disp. / mín.</p>
                </div>
                <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                  −{formatNumber(deficit, 0)} ud.
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Header skeleton ──────────────────────────────────────────────
function HeaderSkeleton() {
  return (
    <div className="mb-6 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-7 h-7 bg-gray-100 rounded-lg" />
        <div className="h-6 w-48 bg-gray-100 rounded" />
      </div>
      <div className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl">
        <div className="w-10 h-10 bg-gray-100 rounded-xl" />
        <div className="flex-1">
          <div className="h-4 w-32 bg-gray-100 rounded mb-2" />
          <div className="h-3 w-24 bg-gray-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-28 bg-gray-100 rounded-lg" />
          <div className="h-8 w-20 bg-gray-100 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const [warehouseData, stockData] = await Promise.all([
          warehousesService.getById(id),
          stockService.getWarehouseStock(id),
        ]);
        setWarehouse(warehouseData);
        setStocks(stockData);
      } catch {
        toast.error('Error al cargar el almacén');
        navigate('/warehouses');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [id, navigate]);

  const handleExport = async () => {
    if (!id) return;
    setIsExporting(true);
    try {
      const blob = await stockService.exportWarehouseStock(id);
      const name = warehouse?.name ?? 'almacen';
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Error al exportar');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Computed ────────────────────────────────────────────────────
  const totalQuantity = useMemo(
    () => stocks.reduce((acc, s) => acc + Number(s.quantity), 0),
    [stocks]
  );
  const totalValue = useMemo(
    () => stocks.reduce((acc, s) => acc + Number(s.quantity) * Number(s.product?.cost ?? 0), 0),
    [stocks]
  );
  const lowStockItems = useMemo(() => stocks.filter(isLowStock), [stocks]);
  const reservedItems = useMemo(
    () => stocks.filter((s) => Number(s.reservedQuantity) > 0),
    [stocks]
  );

  const filteredStocks = useMemo(() => {
    let base = stocks;
    if (activeTab === 'low') base = lowStockItems;
    else if (activeTab === 'reserved') base = reservedItems;

    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (s) =>
        s.product?.name?.toLowerCase().includes(q) ||
        s.product?.sku?.toLowerCase().includes(q) ||
        s.product?.category?.name?.toLowerCase().includes(q)
    );
  }, [stocks, activeTab, search, lowStockItems, reservedItems]);

  // ── Table columns ────────────────────────────────────────────────
  const columns: Column<Stock>[] = [
    {
      key: 'product.sku',
      header: 'SKU',
      render: (s) => (
        <span className="font-mono text-[11px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
          {s.product?.sku ?? '—'}
        </span>
      ),
    },
    {
      key: 'product.name',
      header: 'Producto',
      render: (s) => (
        <span className="text-sm font-medium text-gray-800">{s.product?.name}</span>
      ),
    },
    {
      key: 'product.category',
      header: 'Categoría',
      render: (s) =>
        s.product?.category?.name
          ? <span className="text-xs text-gray-500">{s.product.category.name}</span>
          : <span className="text-gray-300">—</span>,
    },
    {
      key: 'quantity',
      header: 'Stock',
      render: (s) => (
        <span className="font-medium text-gray-700">{formatNumber(s.quantity, 0)}</span>
      ),
    },
    {
      key: 'available',
      header: 'Disponible',
      render: (s) => {
        const available = Number(s.quantity) - Number(s.reservedQuantity);
        const low = isLowStock(s);
        return (
          <div className="flex flex-col gap-1">
            <span className={`font-semibold text-sm ${low ? 'text-red-600' : available === 0 ? 'text-gray-400' : 'text-emerald-700'}`}>
              {formatNumber(available, 0)}
            </span>
            <StockBar stock={s} />
          </div>
        );
      },
    },
    {
      key: 'minQuantity',
      header: 'Mínimo',
      render: (s) =>
        s.minQuantity !== null
          ? <span className="text-sm text-gray-600">{formatNumber(Number(s.minQuantity), 0)}</span>
          : <span className="text-gray-300">—</span>,
    },
    {
      key: 'cost',
      header: 'Costo unit.',
      render: (s) =>
        s.product?.cost !== undefined
          ? <span className="text-sm text-gray-600">{formatCurrency(Number(s.product.cost), 'ARS')}</span>
          : <span className="text-gray-300">—</span>,
    },
    {
      key: 'value',
      header: 'Valor total',
      render: (s) =>
        s.product?.cost !== undefined
          ? <span className="text-sm font-semibold text-gray-700">{formatCurrency(Number(s.quantity) * Number(s.product.cost), 'ARS')}</span>
          : <span className="text-gray-300">—</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (s) => {
        if (isLowStock(s)) return <Badge variant="error">Stock bajo</Badge>;
        if (Number(s.reservedQuantity) > 0) return <Badge variant="warning">Con reservas</Badge>;
        return <Badge variant="success">Normal</Badge>;
      },
    },
  ];

  const tabs: { id: FilterTab; label: string; count: number; icon: React.ReactNode }[] = [
    { id: 'all', label: 'Todos', count: stocks.length, icon: <Package className="w-3.5 h-3.5" /> },
    { id: 'low', label: 'Stock bajo', count: lowStockItems.length, icon: <TrendingDown className="w-3.5 h-3.5" /> },
    { id: 'reserved', label: 'Con reservas', count: reservedItems.length, icon: <BookLock className="w-3.5 h-3.5" /> },
  ];

  // ── Render ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <HeaderSkeleton />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)}
        </div>
        <Card padding="none">
          <div className="h-64 animate-pulse bg-gray-50 rounded-xl" />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <PageHeader
        title={warehouse?.name ?? 'Almacén'}
        backTo="/warehouses"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} isLoading={isExporting} disabled={!warehouse}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Exportar CSV
            </Button>
            <Button size="sm" onClick={() => navigate(`/warehouses/${id}/edit`)}>
              <Edit className="w-3.5 h-3.5 mr-1.5" />
              Editar
            </Button>
          </div>
        }
      />

      {/* ── Warehouse identity bar ── */}
      {warehouse && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-500">
          {warehouse.address ? (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              {warehouse.address}
            </span>
          ) : (
            <span className="text-gray-300 italic text-xs">Sin dirección registrada</span>
          )}
          <span className="hidden sm:block w-px h-4 bg-gray-200" />
          <span className="flex items-center gap-1.5">
            {warehouse.isActive
              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              : <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 inline-block" />}
            <span className={warehouse.isActive ? 'text-emerald-700' : 'text-gray-400'}>
              {warehouse.isActive ? 'Activo' : 'Inactivo'}
            </span>
          </span>
          {warehouse.isDefault && (
            <>
              <span className="hidden sm:block w-px h-4 bg-gray-200" />
              <span className="flex items-center gap-1.5 text-indigo-600">
                <Star className="w-3.5 h-3.5 fill-current text-yellow-500" />
                Almacén predeterminado
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="SKUs activos"
          value={formatNumber(stocks.length, 0)}
          sub="productos distintos"
          icon={<Tags className="w-4.5 h-4.5" />}
          colorClass="text-indigo-600 bg-indigo-50"
        />
        <StatCard
          label="Unidades en stock"
          value={formatNumber(totalQuantity, 0)}
          sub="cantidad total"
          icon={<Boxes className="w-4.5 h-4.5" />}
          colorClass="text-blue-600 bg-blue-50"
        />
        <StatCard
          label="Valorización"
          value={formatCurrency(totalValue, 'ARS')}
          sub="a costo de compra"
          icon={<DollarSign className="w-4.5 h-4.5" />}
          colorClass="text-emerald-600 bg-emerald-50"
        />
        <StatCard
          label="Stock bajo mínimo"
          value={formatNumber(lowStockItems.length, 0)}
          sub={lowStockItems.length > 0 ? 'requieren reposición' : 'todo en orden'}
          icon={<AlertTriangle className="w-4.5 h-4.5" />}
          colorClass={lowStockItems.length > 0 ? 'text-amber-600 bg-amber-50' : 'text-gray-400 bg-gray-100'}
          highlight={lowStockItems.length > 0}
        />
      </div>

      {/* ── Low stock panel ── */}
      <LowStockPanel items={lowStockItems} />

      {/* ── Inventory table ── */}
      <Card padding="none">
        {/* Card header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Inventario</h3>
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
              {filteredStocks.length}
            </span>
          </div>
          {/* Search */}
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto o SKU..."
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                activeTab === tab.id
                  ? tab.id === 'low'
                    ? 'bg-amber-100 text-amber-700 shadow-sm'
                    : tab.id === 'reserved'
                    ? 'bg-indigo-100 text-indigo-700 shadow-sm'
                    : 'bg-white text-gray-700 shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-[10px] font-bold px-1 py-0.5 rounded-full min-w-[18px] text-center leading-none ${
                  activeTab === tab.id
                    ? tab.id === 'low' ? 'bg-amber-200 text-amber-800' : tab.id === 'reserved' ? 'bg-indigo-200 text-indigo-800' : 'bg-gray-100 text-gray-600'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          data={filteredStocks}
          isLoading={false}
          keyExtractor={(s) => s.id}
          emptyMessage={
            search
              ? `Sin resultados para "${search}"`
              : activeTab === 'low'
              ? 'No hay productos bajo stock mínimo'
              : activeTab === 'reserved'
              ? 'No hay productos con reservas'
              : 'No hay productos en este almacén'
          }
        />

        {/* Footer totals */}
        {stocks.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-t border-gray-100 bg-gray-50/60">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {lowStockItems.length > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="w-3 h-3" />
                  {lowStockItems.length} bajo mínimo
                </span>
              )}
              {reservedItems.length > 0 && (
                <span className="flex items-center gap-1 text-indigo-600">
                  <BookLock className="w-3 h-3" />
                  {reservedItems.length} con reservas
                </span>
              )}
            </div>
            <div className="flex items-center gap-5 text-sm">
              <span className="text-gray-500">
                Total:{' '}
                <span className="font-semibold text-gray-800">{formatNumber(totalQuantity, 0)} ud.</span>
              </span>
              <span className="text-gray-500">
                Valor:{' '}
                <span className="font-bold text-emerald-700">{formatCurrency(totalValue, 'ARS')}</span>
              </span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
