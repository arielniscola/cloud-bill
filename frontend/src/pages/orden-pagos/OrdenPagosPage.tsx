import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button } from '../../components/ui';
import { PageHeader, Pagination } from '../../components/shared';
import { ordenPagosService, suppliersService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PAYMENT_METHODS } from '../../utils/constants';
import type { OrdenPago, OrdenPagoStatus } from '../../types/ordenPago.types';
import type { Supplier } from '../../types';

const STATUS_VARIANT: Record<string, 'success' | 'error'> = {
  EMITTED: 'success',
  CANCELLED: 'error',
};
const STATUS_LABELS: Record<string, string> = {
  EMITTED: 'Emitida',
  CANCELLED: 'Cancelada',
};

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <td key={i} className="px-5 py-3.5">
          <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded" />
        </td>
      ))}
    </tr>
  );
}

const selectCls = 'px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30';

export default function OrdenPagosPage() {
  const navigate = useNavigate();
  const [ordenPagos, setOrdenPagos]     = useState<OrdenPago[]>([]);
  const [suppliers, setSuppliers]       = useState<Supplier[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [total, setTotal]               = useState(0);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [statusFilter, setStatusFilter]     = useState('');
  const [dateFrom, setDateFrom]             = useState('');
  const [dateTo, setDateTo]                 = useState('');
  const LIMIT = 20;

  const hasFilters = !!(supplierFilter || statusFilter || dateFrom || dateTo);

  const clearFilters = () => {
    setSupplierFilter(''); setStatusFilter('');
    setDateFrom(''); setDateTo(''); setPage(1);
  };

  const fetchOrdenPagos = async () => {
    setIsLoading(true);
    try {
      const result = await ordenPagosService.getAll({
        page, limit: LIMIT,
        supplierId:    supplierFilter || undefined,
        status:        (statusFilter as OrdenPagoStatus) || undefined,
        dateFrom:      dateFrom || undefined,
        dateTo:        dateTo   || undefined,
      });
      setOrdenPagos(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch {
      toast.error('Error al cargar órdenes de pago');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    suppliersService.getAll({ limit: 1000 }).then((r) => setSuppliers(r.data)).catch(() => {});
  }, []);

  useEffect(() => { fetchOrdenPagos(); }, // eslint-disable-line react-hooks/exhaustive-deps
    [page, supplierFilter, statusFilter, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (setter: (v: string) => void) => (v: string) => { setter(v); setPage(1); };

  return (
    <div>
      <PageHeader
        title="Órdenes de Pago"
        subtitle={`${total} orden${total !== 1 ? 'es' : ''}`}
        actions={
          <Button onClick={() => navigate('/orden-pagos/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva orden de pago
          </Button>
        }
      />

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-52">
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Proveedor</label>
            <select value={supplierFilter} onChange={(e) => change(setSupplierFilter)(e.target.value)} className={selectCls}>
              <option value="">Todos</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Estado</label>
            <select value={statusFilter} onChange={(e) => change(setStatusFilter)(e.target.value)} className={selectCls}>
              <option value="">Todos</option>
              <option value="EMITTED">Emitida</option>
              <option value="CANCELLED">Cancelada</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Desde</label>
            <input type="date" value={dateFrom} onChange={(e) => change(setDateFrom)(e.target.value)} className={selectCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Hasta</label>
            <input type="date" value={dateTo} onChange={(e) => change(setDateTo)(e.target.value)} className={selectCls} />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-red-600 border border-dashed border-gray-300 rounded-lg hover:border-red-300 transition-colors">
              <X className="w-3.5 h-3.5" />Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50/80 dark:bg-slate-700/50">
              <tr>
                {['N°', 'Proveedor', 'Fecha', 'Método', 'Monto', 'Estado'].map((h) => (
                  <th key={h} className={`px-5 py-3 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider ${h === 'Monto' ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                : ordenPagos.length === 0
                ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400 dark:text-slate-500">
                      {hasFilters ? 'Sin resultados para los filtros aplicados' : 'No hay órdenes de pago'}
                    </td>
                  </tr>
                )
                : ordenPagos.map((op) => (
                  <tr
                    key={op.id}
                    onClick={() => navigate(`/orden-pagos/${op.id}`)}
                    className={`hover:bg-gray-50/60 dark:hover:bg-slate-700 transition-colors cursor-pointer ${op.status === 'CANCELLED' ? 'opacity-60' : ''}`}
                  >
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-mono font-medium text-indigo-600 dark:text-indigo-400">{op.number}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-900 dark:text-white font-medium">{op.supplier?.name ?? '—'}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-slate-400 tabular-nums">{formatDate(op.date)}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-slate-400">{PAYMENT_METHODS[op.paymentMethod] ?? op.paymentMethod}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-white text-right tabular-nums">{formatCurrency(Number(op.amount), op.currency)}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant={STATUS_VARIANT[op.status] ?? 'default'} dot>
                        {STATUS_LABELS[op.status] ?? op.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-700">
            <Pagination page={page} totalPages={totalPages} limit={LIMIT} total={total} onPageChange={setPage} onLimitChange={() => {}} />
          </div>
        )}
      </div>
    </div>
  );
}
