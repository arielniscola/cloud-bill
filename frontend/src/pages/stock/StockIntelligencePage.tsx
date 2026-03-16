import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  Brain, AlertTriangle, TrendingDown, Package,
  DollarSign, Search, RefreshCw,
} from 'lucide-react';
import { Card, Badge, Button, Select } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { stockIntelligenceService, warehousesService } from '../../services';
import { formatNumber, formatCurrency } from '../../utils/formatters';
import type {
  StockInsight, StockIntelligenceSummary, StockRiskLevel,
} from '../../types';
import type { Warehouse } from '../../types';

// ── Types ─────────────────────────────────────────────────────────
type RiskTab = 'all' | StockRiskLevel | 'dead';

// ── Helpers ────────────────────────────────────────────────────────
const RISK_BADGE: Record<StockRiskLevel, 'error' | 'warning' | 'success' | 'default'> = {
  critical: 'error',
  warning:  'warning',
  ok:       'success',
  no_data:  'default',
};

const RISK_LABEL: Record<StockRiskLevel, string> = {
  critical: 'Crítico',
  warning:  'Alerta',
  ok:       'OK',
  no_data:  'Sin datos',
};

const ROW_CLASS: Record<StockRiskLevel, string> = {
  critical: 'bg-red-50/60 dark:bg-red-900/20 hover:bg-red-100/50 dark:hover:bg-red-900/30',
  warning:  'bg-amber-50/40 dark:bg-amber-900/20 hover:bg-amber-100/40 dark:hover:bg-amber-900/30',
  ok:       'hover:bg-gray-50/70 dark:hover:bg-slate-700',
  no_data:  'hover:bg-gray-50/70 dark:hover:bg-slate-700',
};

// ── Sub-components ─────────────────────────────────────────────────
function DaysCell({ days, risk }: { days: number | null; risk: StockRiskLevel }) {
  if (days === null) return <span className="text-gray-400 dark:text-slate-500 text-xs">Sin ventas</span>;
  const cls =
    risk === 'critical' ? 'text-red-600 dark:text-red-400 font-semibold' :
    risk === 'warning'  ? 'text-amber-600 dark:text-amber-400 font-semibold' :
    'text-gray-700 dark:text-slate-300';
  return <span className={cls}>{formatNumber(days, 0)} días</span>;
}

function StatCard({
  label, value, sub, icon, colorClass, highlight,
}: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; colorClass: string; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'ring-1 ring-red-200 dark:ring-red-800' : ''}>
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-xl flex-shrink-0 ${colorClass}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-slate-400 leading-none mb-1">{label}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
          {sub && <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 leading-none">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

function StatSkeleton() {
  return (
    <Card>
      <div className="flex items-start gap-3 animate-pulse">
        <div className="w-10 h-10 bg-gray-100 dark:bg-slate-700 rounded-xl flex-shrink-0" />
        <div className="flex-1">
          <div className="h-3 w-20 bg-gray-100 dark:bg-slate-700 rounded mb-2" />
          <div className="h-5 w-14 bg-gray-100 dark:bg-slate-700 rounded" />
        </div>
      </div>
    </Card>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100 dark:border-slate-700 animate-pulse">
      {Array.from({ length: 9 }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-full max-w-[80px]" />
        </td>
      ))}
    </tr>
  );
}

function InsightRow({ item }: { item: StockInsight }) {
  return (
    <tr className={`border-b border-gray-100 dark:border-slate-700 transition-colors ${
      item.isDeadStock ? 'bg-purple-50/40 dark:bg-purple-900/20 hover:bg-purple-100/30 dark:hover:bg-purple-900/30' : ROW_CLASS[item.riskLevel]
    }`}>
      <td className="px-4 py-3">
        <p className="font-medium text-gray-800 dark:text-slate-200 text-sm leading-tight">{item.productName}</p>
        <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{item.sku}</p>
        {item.categoryName && (
          <p className="text-[11px] text-gray-400 dark:text-slate-500">{item.categoryName}</p>
        )}
      </td>
      <td className="px-4 py-3 text-gray-600 dark:text-slate-400 whitespace-nowrap text-sm">{item.warehouseName}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <span className="font-medium text-gray-800 dark:text-slate-200">{formatNumber(item.availableStock, 0)}</span>
        {item.minQuantity !== null && (
          <span className="text-gray-400 dark:text-slate-500 text-xs ml-1">/ mín {formatNumber(item.minQuantity, 0)}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right text-gray-600 dark:text-slate-400 text-sm">
        {item.avgDailySales > 0
          ? formatNumber(item.avgDailySales, 2)
          : <span className="text-gray-400 dark:text-slate-500 text-xs">—</span>
        }
      </td>
      <td className="px-4 py-3 text-right">
        <DaysCell days={item.daysUntilStockOut} risk={item.riskLevel} />
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {item.recommendedQty > 0
          ? <span className="font-medium text-violet-700 dark:text-violet-400">{formatNumber(item.recommendedQty, 0)}</span>
          : <span className="text-gray-400 dark:text-slate-500 text-xs">—</span>
        }
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap text-gray-700 dark:text-slate-300 text-sm">
        {item.estimatedCost > 0
          ? formatCurrency(item.estimatedCost, 'ARS')
          : <span className="text-gray-400 dark:text-slate-500 text-xs">—</span>
        }
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap text-gray-600 dark:text-slate-400 text-sm">
        {formatCurrency(item.immobilizedValue, 'ARS')}
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap">
        <div className="flex flex-col items-center gap-1">
          <Badge variant={RISK_BADGE[item.riskLevel]}>{RISK_LABEL[item.riskLevel]}</Badge>
          {item.isDeadStock && (
            <Badge variant="default">Muerto</Badge>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────
export default function StockIntelligencePage() {
  const [summary, setSummary]       = useState<StockIntelligenceSummary | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [days, setDays]             = useState(30);
  const [isLoading, setIsLoading]   = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [search, setSearch]         = useState('');
  const [riskTab, setRiskTab]       = useState<RiskTab>('all');

  useEffect(() => {
    warehousesService.getAll().then(setWarehouses).catch(() => {});
  }, []);

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await stockIntelligenceService.getInsights({
        warehouseId: warehouseId || undefined,
        days,
      });
      setSummary(data);
    } catch {
      toast.error('Error al cargar el análisis de stock');
    } finally {
      setIsLoading(false);
      setIsFirstLoad(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [warehouseId, days]);

  const filtered = useMemo(() => {
    if (!summary) return [];
    let items = summary.insights;
    if (riskTab === 'dead') {
      items = items.filter(i => i.isDeadStock);
    } else if (riskTab !== 'all') {
      items = items.filter(i => i.riskLevel === riskTab);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(i =>
        i.productName.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.warehouseName.toLowerCase().includes(q),
      );
    }
    return items;
  }, [summary, riskTab, search]);

  const okCount     = summary?.insights.filter(i => i.riskLevel === 'ok').length ?? 0;
  const noDataCount = summary?.insights.filter(i => i.riskLevel === 'no_data').length ?? 0;

  const tabs: { id: RiskTab; label: string; count: number; activeClass: string }[] = [
    { id: 'all',      label: 'Todos',        count: summary?.insights.length ?? 0, activeClass: 'text-gray-700 dark:text-slate-200 border-gray-400 bg-gray-100 dark:bg-slate-700' },
    { id: 'critical', label: 'Críticos',     count: summary?.criticalCount ?? 0,   activeClass: 'text-red-700 dark:text-red-400 border-red-400 bg-red-100 dark:bg-red-900/30' },
    { id: 'warning',  label: 'Alertas',      count: summary?.warningCount ?? 0,    activeClass: 'text-amber-700 dark:text-amber-400 border-amber-400 bg-amber-100 dark:bg-amber-900/30' },
    { id: 'ok',       label: 'OK',           count: okCount,                        activeClass: 'text-emerald-700 dark:text-emerald-400 border-emerald-400 bg-emerald-100 dark:bg-emerald-900/30' },
    { id: 'no_data',  label: 'Sin datos',    count: noDataCount,                   activeClass: 'text-gray-500 dark:text-slate-400 border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700' },
    { id: 'dead',     label: 'Stock muerto', count: summary?.deadStockCount ?? 0,  activeClass: 'text-purple-700 dark:text-purple-400 border-purple-400 bg-purple-100 dark:bg-purple-900/30' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Inteligente"
        subtitle="Análisis predictivo de inventario y alertas de reposición"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={warehouseId}
              options={[
                { value: '', label: 'Todos los almacenes' },
                ...warehouses.map(w => ({ value: w.id, label: w.name })),
              ]}
              onChange={setWarehouseId}
              className="w-full sm:w-44"
            />
            <Select
              value={String(days)}
              options={[
                { value: '7',  label: 'Últimos 7 días' },
                { value: '15', label: 'Últimos 15 días' },
                { value: '30', label: 'Últimos 30 días' },
                { value: '60', label: 'Últimos 60 días' },
                { value: '90', label: 'Últimos 90 días' },
              ]}
              onChange={v => setDays(Number(v))}
              className="w-full sm:w-36"
            />
            <Button variant="secondary" size="sm" onClick={load} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {isFirstLoad ? (
          Array.from({ length: 5 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Críticos"
              value={String(summary?.criticalCount ?? 0)}
              sub="Stock por agotarse pronto"
              icon={<AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />}
              colorClass="bg-red-100 dark:bg-red-900/30"
              highlight={(summary?.criticalCount ?? 0) > 0}
            />
            <StatCard
              label="En alerta"
              value={String(summary?.warningCount ?? 0)}
              sub="Requieren atención"
              icon={<AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400" />}
              colorClass="bg-amber-100 dark:bg-amber-900/30"
            />
            <StatCard
              label="Stock muerto"
              value={String(summary?.deadStockCount ?? 0)}
              sub="Sin movimiento reciente"
              icon={<TrendingDown className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
              colorClass="bg-purple-100 dark:bg-purple-900/30"
            />
            <StatCard
              label="Capital total"
              value={formatCurrency(summary?.totalCapital ?? 0, 'ARS')}
              sub="Valor del inventario"
              icon={<DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
              colorClass="bg-blue-100 dark:bg-blue-900/30"
            />
            <StatCard
              label="Capital inmovilizado"
              value={formatCurrency(summary?.deadStockCapital ?? 0, 'ARS')}
              sub="En stock sin rotación"
              icon={<Package className="w-5 h-5 text-orange-500 dark:text-orange-400" />}
              colorClass="bg-orange-100 dark:bg-orange-900/20"
            />
          </>
        )}
      </div>

      {/* Table card */}
      <Card className="p-0 overflow-hidden">
        {/* Tabs + search bar */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-slate-700 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Brain className="w-4 h-4 text-violet-500 flex-shrink-0" />
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setRiskTab(t.id)}
                className={`
                  inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors
                  ${riskTab === t.id
                    ? t.activeClass
                    : 'text-gray-500 dark:text-slate-400 border-transparent hover:bg-gray-100 dark:hover:bg-slate-700'}
                `}
              >
                {t.label}
                <span className="rounded-full px-1.5 py-0 text-[10px] font-bold leading-4 bg-white/60 dark:bg-slate-900/40">
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Buscar producto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-300 w-full sm:w-64"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-700/50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap">Producto</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap">Almacén</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap">Disponible</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap">Ventas/día</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap">Días hasta 0</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap">Stock recom.</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap">Costo recom.</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap">Cap. inmov.</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap">Riesgo</th>
              </tr>
            </thead>
            <tbody>
              {isFirstLoad ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-slate-500 text-sm">
                    {isLoading ? 'Cargando análisis...' : 'No se encontraron resultados'}
                  </td>
                </tr>
              ) : (
                filtered.map(item => (
                  <InsightRow
                    key={`${item.productId}-${item.warehouseId}`}
                    item={item}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!isFirstLoad && filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100 dark:border-slate-700 bg-gray-50/40 dark:bg-slate-700/30">
            <span className="text-xs text-gray-400 dark:text-slate-500">
              {filtered.length} {filtered.length === 1 ? 'producto' : 'productos'}
              {summary && ` · ventana de análisis: ${days} días`}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
