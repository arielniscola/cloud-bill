import { useState, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
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
  CREATE: 'bg-green-500/10 text-green-400',
  UPDATE: 'bg-blue-500/10 text-blue-400',
  DELETE: 'bg-red-500/10 text-red-400',
  PAYMENT: 'bg-indigo-500/10 text-indigo-400',
  CANCEL: 'bg-orange-500/10 text-orange-400',
  TRANSFER: 'bg-purple-500/10 text-purple-400',
};

const ENTITY_OPTIONS = ['Invoice', 'Customer', 'Product', 'Stock'];
const ACTION_OPTIONS: ActivityAction[] = ['CREATE', 'UPDATE', 'DELETE', 'PAYMENT', 'CANCEL', 'TRANSFER'];

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
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-wrap gap-3">
        {/* Entidad */}
        <select
          value={filters.entity ?? ''}
          onChange={(e) => handleFilterChange('entity', e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Todas las entidades</option>
          {ENTITY_OPTIONS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>

        {/* Acción */}
        <select
          value={filters.action ?? ''}
          onChange={(e) => handleFilterChange('action', e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Todas las acciones</option>
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>

        {/* Desde */}
        <input
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Desde"
        />

        {/* Hasta */}
        <input
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(e) => handleFilterChange('dateTo', e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Hasta"
        />

        <button
          onClick={() => {
            setPage(1);
            setFilters({ entity: '', action: undefined, dateFrom: '', dateTo: '' });
          }}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-3 py-2"
        >
          Limpiar filtros
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Search className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No hay registros de actividad</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Usuario</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Acción</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Entidad</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Descripción</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                    {formatDate(log.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    <span className="font-medium">{log.user?.name ?? '–'}</span>
                    {log.user?.email && (
                      <span className="block text-xs text-slate-500">{log.user.email}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${ACTION_COLORS[log.action]}`}
                    >
                      {ACTION_LABELS[log.action]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{log.entity}</td>
                  <td className="px-4 py-3 text-slate-300">{log.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
