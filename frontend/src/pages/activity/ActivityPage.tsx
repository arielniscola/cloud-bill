import { useState, useEffect, useCallback } from 'react';
import { Search, Clock } from 'lucide-react';
import { activityLogsService } from '../../services';
import type { ActivityLog, ActivityLogFilters, ActivityAction } from '../../types';
import PageHeader from '../../components/shared/PageHeader';

const ACTION_LABELS: Record<ActivityAction, string> = {
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  DELETE: 'Eliminación',
  PAYMENT: 'Pago',
  CANCEL: 'Cancelación',
  TRANSFER: 'Transferencia',
};

const ACTION_COLORS: Record<ActivityAction, string> = {
  CREATE:   'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400',
  UPDATE:   'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  DELETE:   'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  PAYMENT:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400',
  CANCEL:   'bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400',
  TRANSFER: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
};

const ENTITY_OPTIONS = ['Invoice', 'Customer', 'Product', 'Stock'];
const ACTION_OPTIONS: ActivityAction[] = ['CREATE', 'UPDATE', 'DELETE', 'PAYMENT', 'CANCEL', 'TRANSFER'];

const inputCls =
  'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors';

export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState<ActivityLogFilters>({
    entity: '',
    action: undefined,
    dateFrom: '',
    dateTo: '',
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: ActivityLogFilters = { page, limit: 20 };
      if (filters.entity) params.entity = filters.entity;
      if (filters.action) params.action = filters.action;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;

      const result = await activityLogsService.getAll(params);
      setLogs(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function handleFilterChange(key: keyof ActivityLogFilters, value: string) {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historial de actividad"
        subtitle={`${total} registros en total`}
      />

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex flex-wrap gap-3">
        <select
          value={filters.entity ?? ''}
          onChange={(e) => handleFilterChange('entity', e.target.value)}
          className={inputCls}
        >
          <option value="">Todas las entidades</option>
          {ENTITY_OPTIONS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>

        <select
          value={filters.action ?? ''}
          onChange={(e) => handleFilterChange('action', e.target.value)}
          className={inputCls}
        >
          <option value="">Todas las acciones</option>
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a]}</option>
          ))}
        </select>

        <input
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
          className={inputCls}
        />

        <input
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(e) => handleFilterChange('dateTo', e.target.value)}
          className={inputCls}
        />

        <button
          onClick={() => {
            setPage(1);
            setFilters({ entity: '', action: undefined, dateFrom: '', dateTo: '' });
          }}
          className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors px-3 py-2"
        >
          Limpiar filtros
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-slate-500">
            <Search className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No hay registros de actividad</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium text-xs uppercase tracking-wide">Fecha</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium text-xs uppercase tracking-wide">Usuario</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium text-xs uppercase tracking-wide">Acción</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium text-xs uppercase tracking-wide">Entidad</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium text-xs uppercase tracking-wide">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400">
                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="text-xs">{formatDate(log.createdAt)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-800 dark:text-slate-200">
                      {log.user?.name ?? '–'}
                    </span>
                    {log.user?.email && (
                      <span className="block text-xs text-gray-400 dark:text-slate-500">{log.user.email}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${ACTION_COLORS[log.action]}`}>
                      {ACTION_LABELS[log.action]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 px-1.5 py-0.5 rounded">
                      {log.entity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-300 max-w-xs">
                    {log.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Página <span className="font-medium text-gray-700 dark:text-slate-300">{page}</span> de{' '}
            <span className="font-medium text-gray-700 dark:text-slate-300">{totalPages}</span>
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
