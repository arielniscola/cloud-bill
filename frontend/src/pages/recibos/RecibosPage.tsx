import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge } from '../../components/ui';
import { PageHeader, Pagination, CustomerSearchSelect } from '../../components/shared';
import { recibosService, customersService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PAYMENT_METHODS, RECIBO_STATUSES, RECIBO_STATUS_OPTIONS, PAYMENT_METHOD_OPTIONS } from '../../utils/constants';
import type { Recibo, Customer, ReciboStatus, PaymentMethod } from '../../types';

const STATUS_VARIANT: Record<string, 'success' | 'error' | 'default'> = {
  EMITTED: 'success',
  CANCELLED: 'error',
};

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <td key={i} className="px-5 py-3.5">
          <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded" />
        </td>
      ))}
    </tr>
  );
}

const selectCls = 'px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30';

export default function RecibosPage() {
  const navigate = useNavigate();
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const LIMIT = 20;

  const hasFilters = !!(statusFilter || paymentMethodFilter || customerFilter || dateFrom || dateTo);

  const clearFilters = () => {
    setStatusFilter('');
    setPaymentMethodFilter('');
    setCustomerFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const fetchRecibos = async () => {
    setIsLoading(true);
    try {
      const result = await recibosService.getAll({
        page,
        limit: LIMIT,
        status: (statusFilter as ReciboStatus) || undefined,
        paymentMethod: (paymentMethodFilter as PaymentMethod) || undefined,
        customerId: customerFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setRecibos(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch {
      toast.error('Error al cargar recibos');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    customersService.getAll({ limit: 1000, isActive: true })
      .then((r) => setCustomers(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchRecibos();
  }, [page, statusFilter, paymentMethodFilter, customerFilter, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Recibos"
        subtitle={`${total} recibo${total !== 1 ? 's' : ''}`}
      />

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 mb-6 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Customer */}
          <div className="w-60">
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
              {RECIBO_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Método de pago */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Método de pago</label>
            <select
              value={paymentMethodFilter}
              onChange={(e) => handleFilterChange(setPaymentMethodFilter)(e.target.value)}
              className={selectCls}
            >
              <option value="">Todos</option>
              {PAYMENT_METHOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
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

      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50/80 dark:bg-slate-700/50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">N°</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Vinculado a</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Cliente</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Fecha</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Monto</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Método</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                : recibos.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400 dark:text-slate-500">
                      {hasFilters ? 'Sin resultados para los filtros aplicados' : 'No hay recibos'}
                    </td>
                  </tr>
                )
                : recibos.map((recibo) => (
                  <tr
                    key={recibo.id}
                    className={`hover:bg-gray-50/60 dark:hover:bg-slate-700 transition-colors duration-100 cursor-pointer ${recibo.status === 'CANCELLED' ? 'opacity-60' : ''}`}
                    onClick={() => navigate(`/recibos/${recibo.id}`)}
                  >
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-mono font-medium text-indigo-600 dark:text-indigo-400">
                        {recibo.number}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-slate-300">
                      {recibo.invoice
                        ? <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">Factura {recibo.invoice.number}</span>
                        : recibo.budget
                        ? <span className="text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full font-medium">Presupuesto {recibo.budget.number}</span>
                        : <span className="text-gray-400 dark:text-slate-500">—</span>
                      }
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-900 dark:text-white">
                      {recibo.customer?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-slate-400 tabular-nums">
                      {formatDate(recibo.date)}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-white text-right tabular-nums">
                      {formatCurrency(Number(recibo.amount), recibo.currency)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-slate-400">
                      {PAYMENT_METHODS[recibo.paymentMethod] ?? recibo.paymentMethod}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <Badge variant={STATUS_VARIANT[recibo.status] ?? 'default'} dot>
                        {RECIBO_STATUSES[recibo.status]}
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
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
