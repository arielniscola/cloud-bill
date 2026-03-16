import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button } from '../../components/ui';
import { PageHeader, Pagination, SearchInput } from '../../components/shared';
import { ordenPedidosService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { ORDEN_PEDIDO_STATUSES, ORDEN_PEDIDO_STATUS_OPTIONS } from '../../utils/constants';
import type { OrdenPedido, OrdenPedidoStatus } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';

type StatusVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

const STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: 'default',
  CONFIRMED: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  CANCELLED: 'error',
  CONVERTED: 'info',
};

export default function OrdenPedidosPage() {
  const navigate = useNavigate();
  const { canWrite } = usePermissions();
  const [orders, setOrders] = useState<OrdenPedido[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await ordenPedidosService.getAll({ page, limit: 20, status: statusFilter || undefined });
      setOrders(result.data);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch {
      toast.error('Error al cargar órdenes de pedido');
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filteredOrders = search
    ? orders.filter(
        (o) =>
          o.number.toLowerCase().includes(search.toLowerCase()) ||
          o.customer?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : orders;

  return (
    <div>
      <PageHeader
        title="Órdenes de Pedido"
        subtitle={`${total} orden${total !== 1 ? 'es' : ''}`}
        actions={
          canWrite ? (
            <Button onClick={() => navigate('/orden-pedidos/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Nueva Orden
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por número o cliente..."
          className="flex-1 min-w-48"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Todos los estados</option>
          {ORDEN_PEDIDO_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-slate-400 text-sm">
            No hay órdenes de pedido
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50/80 dark:bg-slate-700/50 border-b border-gray-200 dark:border-slate-700">
                <tr>
                  {['Número', 'Cliente', 'Fecha', 'Vencimiento', 'Total', 'Estado'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {filteredOrders.map((op) => (
                  <tr
                    key={op.id}
                    onClick={() => navigate(`/orden-pedidos/${op.id}`)}
                    className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 cursor-pointer transition-colors duration-100"
                  >
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-mono font-semibold text-indigo-600 dark:text-indigo-400">{op.number}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-slate-300">
                      {op.customer?.name ?? <span className="text-gray-400 italic">Sin cliente</span>}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-slate-300 tabular-nums">
                      {formatDate(op.date)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-slate-400 tabular-nums">
                      {op.dueDate ? formatDate(op.dueDate) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                      {formatCurrency(Number(op.total), op.currency)}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={STATUS_VARIANT[op.status] ?? 'default'} dot>
                        {ORDEN_PEDIDO_STATUSES[op.status as OrdenPedidoStatus] ?? op.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
