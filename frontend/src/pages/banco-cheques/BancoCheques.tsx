import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Clock, RefreshCw, XCircle, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button } from '../../components/ui';
import { PageHeader, SearchInput, Pagination } from '../../components/shared';
import { recibosService, customersService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { CHECK_STATUSES, CHECK_STATUS_COLORS, CHECK_STATUS_OPTIONS } from '../../utils/constants';
import type { Recibo, CheckStatus, Customer } from '../../types';

type StatusFilter = CheckStatus | 'ALL' | 'OVERDUE';

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'OVERDUE', label: 'Vencidos' },
  { value: 'PENDING', label: 'En cartera' },
  { value: 'DEPOSITED', label: 'Depositados' },
  { value: 'CLEARED', label: 'Acreditados' },
  { value: 'BOUNCED', label: 'Rechazados' },
  { value: 'RETURNED', label: 'Devueltos' },
];

const NEXT_STATUSES: Record<string, Array<{ value: CheckStatus; label: string }>> = {
  PENDING: [
    { value: 'DEPOSITED', label: 'Marcar como depositado' },
    { value: 'RETURNED', label: 'Devolver al cliente' },
    { value: 'BOUNCED', label: 'Marcar como rechazado' },
  ],
  DEPOSITED: [
    { value: 'CLEARED', label: 'Marcar como acreditado' },
    { value: 'BOUNCED', label: 'Marcar como rechazado' },
  ],
  CLEARED: [],
  BOUNCED: [
    { value: 'PENDING', label: 'Volver a cartera' },
  ],
  RETURNED: [
    { value: 'PENDING', label: 'Volver a cartera' },
  ],
};

function isOverdue(recibo: Recibo): boolean {
  if (!recibo.checkDueDate) return false;
  if (recibo.checkStatus !== 'PENDING') return false;
  return new Date(recibo.checkDueDate) < new Date();
}

export default function BancoCheques() {
  const navigate = useNavigate();
  const [checks, setChecks] = useState<Recibo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: Record<string, any> = { page, limit: 50 };

      if (selectedCustomerId) filters.customerId = selectedCustomerId;

      if (statusFilter === 'OVERDUE') {
        filters.checkStatus = 'PENDING';
        filters.dueDateTo = new Date().toISOString();
      } else if (statusFilter !== 'ALL') {
        filters.checkStatus = statusFilter;
      }

      const result = await recibosService.getChecks(filters);
      let data = result.data;

      if (statusFilter === 'OVERDUE') {
        data = data.filter(isOverdue);
      }

      setChecks(data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch {
      toast.error('Error al cargar cheques');
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, selectedCustomerId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    customersService.getAll({ limit: 1000, isActive: true }).then((r) => setCustomers(r.data)).catch(() => {});
  }, []);

  const handleUpdateStatus = async (id: string, status: CheckStatus) => {
    setUpdatingId(id);
    setOpenMenuId(null);
    try {
      const updated = await recibosService.updateCheckStatus(id, status);
      setChecks((prev) => prev.map((c) => (c.id === id ? updated : c)));
      toast.success(`Estado actualizado a: ${CHECK_STATUSES[status]}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al actualizar estado');
    } finally {
      setUpdatingId(null);
    }
  };

  // Summary counts from current data
  const pending = checks.filter((c) => c.checkStatus === 'PENDING').length;
  const overdue = checks.filter(isOverdue).length;
  const deposited = checks.filter((c) => c.checkStatus === 'DEPOSITED').length;
  const cleared = checks.filter((c) => c.checkStatus === 'CLEARED').length;
  const bounced = checks.filter((c) => c.checkStatus === 'BOUNCED').length;

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Banco de Cheques"
        subtitle="Gestión de cheques recibidos"
        actions={
          <Button variant="outline" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualizar
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'En cartera', value: pending, icon: Clock, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
          { label: 'Vencidos', value: overdue, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: 'Depositados', value: deposited, icon: RefreshCw, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Acreditados', value: cleared, icon: CheckCircle, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: 'Rechazados', value: bounced, icon: XCircle, color: 'text-red-700 dark:text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`${bg} border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex items-center gap-3`}>
            <Icon className={`w-5 h-5 ${color} flex-shrink-0`} />
            <div>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 ${
                statusFilter === opt.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Customer filter */}
        <div className="relative ml-auto">
          <select
            className="text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-48"
            value={selectedCustomerId}
            onChange={(e) => { setSelectedCustomerId(e.target.value); setPage(1); }}
          >
            <option value="">Todos los clientes</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-lg" />
            ))}
          </div>
        ) : checks.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 dark:text-slate-500 text-sm">No hay cheques para mostrar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50/80 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">N° Recibo</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Cliente</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Banco</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">N° Cheque</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Monto</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Vencimiento</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Origen</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Estado</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {checks.map((check) => {
                  const overdueFlag = isOverdue(check);
                  const nextActions = check.checkStatus ? NEXT_STATUSES[check.checkStatus] ?? [] : [];
                  const isUpdating = updatingId === check.id;

                  return (
                    <tr
                      key={check.id}
                      className={`hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors duration-100 ${overdueFlag ? 'bg-red-50/40 dark:bg-red-900/10' : ''}`}
                    >
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => navigate(`/recibos/${check.id}`)}
                          className="text-sm font-mono font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          {check.number}
                        </button>
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(check.date)}</p>
                      </td>

                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {check.customer?.name ?? '—'}
                        </p>
                      </td>

                      <td className="px-5 py-3.5">
                        <p className="text-sm text-gray-700 dark:text-slate-300">{check.bank ?? '—'}</p>
                      </td>

                      <td className="px-5 py-3.5">
                        <p className="text-sm font-mono text-gray-700 dark:text-slate-300">{check.reference ?? '—'}</p>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                          {formatCurrency(check.amount, check.currency)}
                        </p>
                        {check.currency === 'USD' && check.exchangeRate !== 1 && (
                          <p className="text-xs text-gray-400 dark:text-slate-500 tabular-nums">
                            ≈ {formatCurrency(check.amount * check.exchangeRate, 'ARS')}
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-center">
                        {check.checkDueDate ? (
                          <span className={`text-sm font-medium tabular-nums ${overdueFlag ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-700 dark:text-slate-300'}`}>
                            {overdueFlag && <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />}
                            {formatDate(check.checkDueDate)}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-slate-600">—</span>
                        )}
                      </td>

                      <td className="px-5 py-3.5">
                        {check.invoice && (
                          <button
                            onClick={() => navigate(`/invoices/${check.invoice!.id}`)}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-mono"
                          >
                            {check.invoice.number}
                          </button>
                        )}
                        {check.budget && (
                          <button
                            onClick={() => navigate(`/budgets/${check.budget!.id}`)}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-mono"
                          >
                            {check.budget.number}
                          </button>
                        )}
                        {check.ordenPedido && (
                          <button
                            onClick={() => navigate(`/orden-pedidos/${check.ordenPedido!.id}`)}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-mono"
                          >
                            {check.ordenPedido.number}
                          </button>
                        )}
                        {!check.invoice && !check.budget && !check.ordenPedido && (
                          <span className="text-xs text-gray-400 dark:text-slate-500">Directo</span>
                        )}
                      </td>

                      <td className="px-5 py-3.5">
                        {check.checkStatus ? (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${CHECK_STATUS_COLORS[check.checkStatus]}`}>
                            {CHECK_STATUSES[check.checkStatus as keyof typeof CHECK_STATUSES] ?? check.checkStatus}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-slate-500">—</span>
                        )}
                      </td>

                      <td className="px-5 py-3.5">
                        {nextActions.length > 0 && (
                          <div className="relative">
                            <Button
                              variant="outline"
                              size="sm"
                              isLoading={isUpdating}
                              onClick={() => setOpenMenuId(openMenuId === check.id ? null : check.id)}
                            >
                              Acción
                              <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-60" />
                            </Button>
                            {openMenuId === check.id && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                                <div className="absolute right-0 top-full mt-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-20 min-w-52 py-1 overflow-hidden">
                                  {nextActions.map((action) => (
                                    <button
                                      key={action.value}
                                      onClick={() => handleUpdateStatus(check.id, action.value)}
                                      className={`flex w-full items-center text-left px-4 py-2.5 text-sm transition-colors duration-100 ${
                                        action.value === 'BOUNCED'
                                          ? 'text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                          : action.value === 'CLEARED'
                                          ? 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                          : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                                      }`}
                                    >
                                      {action.label}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
