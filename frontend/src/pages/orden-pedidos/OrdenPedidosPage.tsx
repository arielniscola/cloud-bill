import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button } from '../../components/ui';
import { PageHeader, Pagination, SearchInput, CustomerSearchSelect } from '../../components/shared';
import { ordenPedidosService, customersService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { ORDEN_PEDIDO_STATUSES, ORDEN_PEDIDO_STATUS_OPTIONS } from '../../utils/constants';
import type { OrdenPedido, OrdenPedidoStatus, Customer } from '../../types';
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

const selectCls = 'px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30';

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

export default function OrdenPedidosPage() {
  const navigate = useNavigate();
  const { canWrite } = usePermissions();
  const [orders, setOrders] = useState<OrdenPedido[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const hasFilters = !!(search || statusFilter || customerFilter || currencyFilter || dateFrom || dateTo);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setCustomerFilter('');
    setCurrencyFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const handleFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  useEffect(() => {
    customersService.getAll({ limit: 1000, isActive: true })
      .then((r) => setCustomers(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setIsLoading(true);
    ordenPedidosService.getAll({
      page,
      limit,
      status: statusFilter || undefined,
      customerId: customerFilter || undefined,
      currency: currencyFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: search || undefined,
    })
      .then((result) => {
        setOrders(result.data);
        setTotalPages(result.totalPages);
        setTotal(result.total);
      })
      .catch(() => toast.error('Error al cargar órdenes de pedido'))
      .finally(() => setIsLoading(false));
  }, [page, limit, statusFilter, customerFilter, currencyFilter, dateFrom, dateTo, search]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 mb-6 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Buscar</label>
            <SearchInput
              value={search}
              onChange={handleFilterChange(setSearch)}
              placeholder="Número o cliente..."
            />
          </div>

          {/* Customer */}
          <div className="w-56">
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Cliente</label>
            <CustomerSearchSelect
              customers={customers}
              value={customerFilter}
              onChange={handleFilterChange(setCustomerFilter)}
              clearLabel="Todos los clientes"
            />
          </div>

          {/* Estado */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Estado</label>
            <select
              value={statusFilter}
              onChange={(e) => handleFilterChange(setStatusFilter)(e.target.value)}
              className={selectCls}
            >
              <option value="">Todos</option>
              {ORDEN_PEDIDO_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Moneda */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Moneda</label>
            <select
              value={currencyFilter}
              onChange={(e) => handleFilterChange(setCurrencyFilter)(e.target.value)}
              className={selectCls}
            >
              <option value="">Todas</option>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>

          {/* Fecha desde */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Fecha desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleFilterChange(setDateFrom)(e.target.value)}
              className={selectCls}
            />
          </div>

          {/* Fecha hasta */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Fecha hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleFilterChange(setDateTo)(e.target.value)}
              className={selectCls}
            />
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 border border-dashed border-gray-300 dark:border-slate-600 rounded-lg hover:border-red-300 dark:hover:border-red-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Limpiar
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
                {['Número', 'Cliente', 'Fecha', 'Vencimiento', 'Total', 'Estado'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                : orders.length === 0
                ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400 dark:text-slate-500">
                      {hasFilters ? 'Sin resultados para los filtros aplicados' : 'No hay órdenes de pedido'}
                    </td>
                  </tr>
                )
                : orders.map((op) => (
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
                ))
              }
            </tbody>
          </table>
        </div>

        {(totalPages > 1 || total > 0) && (
          <Pagination
            page={page}
            totalPages={totalPages}
            limit={limit}
            total={total}
            onPageChange={setPage}
            onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
          />
        )}
      </div>
    </div>
  );
}
