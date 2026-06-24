import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Package, Truck, Warehouse as WarehouseIcon, CheckCircle2, XCircle, FileText, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Button } from '../../components/ui';
import { PageHeader, Pagination } from '../../components/shared';
import { purchaseRemitosService, suppliersService, warehousesService } from '../../services';
import { formatDate } from '../../utils/formatters';
import { DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { PurchaseRemito, PurchaseRemitoStatus } from '../../types';

const STATUS_CFG: Record<PurchaseRemitoStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  RECEIVED:  { label: 'Recibido',  className: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  INVOICED:  { label: 'Facturado', className: 'text-indigo-700 bg-indigo-50 border-indigo-200',    icon: FileText },
  CANCELLED: { label: 'Cancelado', className: 'text-red-600 bg-red-50 border-red-200',             icon: XCircle },
};

type Tab = 'all' | PurchaseRemitoStatus;
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'RECEIVED', label: 'Recibidos' },
  { key: 'INVOICED', label: 'Facturados' },
  { key: 'CANCELLED', label: 'Cancelados' },
];

export default function PurchaseRemitosPage() {
  const navigate = useNavigate();
  const [remitos, setRemitos] = useState<PurchaseRemito[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const hasActiveFilters = supplierFilter || warehouseFilter || dateFrom || dateTo || search;

  const clearFilters = () => {
    setSupplierFilter('');
    setWarehouseFilter('');
    setDateFrom('');
    setDateTo('');
    setSearch('');
    setPage(1);
  };

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Load filter options
  useEffect(() => {
    suppliersService.getAll({ limit: 500, isActive: true })
      .then((res) => setSuppliers(res.data.map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => { /* non-blocking */ });
    warehousesService.getAll()
      .then((res) => setWarehouses(res.map((w) => ({ id: w.id, name: w.name }))))
      .catch(() => { /* non-blocking */ });
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await purchaseRemitosService.getAll({
        page, limit,
        status: tab === 'all' ? undefined : tab,
        supplierId: supplierFilter || undefined,
        warehouseId: warehouseFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: debouncedSearch || undefined,
      });
      setRemitos(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      toast.error('Error al cargar remitos de compra');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, tab, supplierFilter, warehouseFilter, dateFrom, dateTo, debouncedSearch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      <PageHeader
        title="Remitos de Compra"
        subtitle="Mercadería recibida pendiente de facturar"
        actions={
          <Button onClick={() => navigate('/purchase-remitos/new')}>
            <Plus className="w-4 h-4 mr-1.5" /> Nuevo remito
          </Button>
        }
      />

      <div className="flex gap-1.5 mb-3">
        {TABS.map((t) => (
          <button key={t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por Nº o proveedor…"
            className="w-56 text-sm pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300"
          />
        </div>
        <select
          value={supplierFilter}
          onChange={(e) => { setSupplierFilter(e.target.value); setPage(1); }}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300"
        >
          <option value="">Todos los proveedores</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          value={warehouseFilter}
          onChange={(e) => { setWarehouseFilter(e.target.value); setPage(1); }}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300"
        >
          <option value="">Todos los almacenes</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300"
            title="Desde"
          />
          <span className="text-gray-400 text-sm">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300"
            title="Hasta"
          />
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700">
              <tr className="text-left text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3">Fecha · Nº</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Almacén</th>
                <th className="px-4 py-3 text-center">Ítems</th>
                <th className="px-4 py-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Cargando…</td></tr>
              ) : remitos.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Sin remitos de compra</td></tr>
              ) : (
                remitos.map((r) => {
                  const cfg = STATUS_CFG[r.status];
                  const StatusIcon = cfg.icon;
                  return (
                    <tr key={r.id} onClick={() => navigate(`/purchase-remitos/${r.id}`)}
                      className="cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-medium text-gray-800 dark:text-slate-200">{formatDate(r.date)}</p>
                        <p className="font-mono text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{r.number}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-slate-300">
                          <Truck className="w-3.5 h-3.5 text-gray-400" />
                          {r.supplier?.name ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-400">
                          <WarehouseIcon className="w-3.5 h-3.5 text-gray-400" />
                          {r.warehouse?.name ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border text-indigo-700 bg-indigo-50 border-indigo-200">
                          <Package className="w-3 h-3" /> {r.itemCount ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.className}`}>
                          <StatusIcon className="w-3 h-3" /> {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && remitos.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            limit={limit}
            total={total}
            onPageChange={setPage}
            onLimitChange={(l) => { setLimit(l); setPage(1); }}
          />
        )}
      </Card>
    </div>
  );
}
