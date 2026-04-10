import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Clock, Download, ExternalLink } from 'lucide-react';
import { activityLogsService } from '../../services';
import { usersService } from '../../services';
import type { ActivityLog, ActivityLogFilters, ActivityAction } from '../../types';
import { PageHeader, SearchInput } from '../../components/shared';
import { Button, Card } from '../../components/ui';
import { DEFAULT_PAGE_SIZE } from '../../utils/constants';
import { DataTable } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';

const ACTION_LABELS: Record<ActivityAction, string> = {
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  DELETE: 'Eliminación',
  PAYMENT: 'Pago',
  CANCEL: 'Cancelación',
  TRANSFER: 'Transferencia',
};

const ACTION_COLORS: Record<ActivityAction, string> = {
  CREATE:   'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-800',
  UPDATE:   'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-800',
  DELETE:   'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-800',
  PAYMENT:  'text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-400 dark:bg-indigo-500/10 dark:border-indigo-800',
  CANCEL:   'text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-500/10 dark:border-orange-800',
  TRANSFER: 'text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-500/10 dark:border-purple-800',
};

const ACTION_OPTIONS: ActivityAction[] = ['CREATE', 'UPDATE', 'DELETE', 'PAYMENT', 'CANCEL', 'TRANSFER'];

// Entity → route mapping for clickable links
const ENTITY_ROUTES: Record<string, string> = {
  Invoice: '/invoices',
  Customer: '/customers',
  Product: '/products',
  Supplier: '/suppliers',
  Warehouse: '/warehouses',
  Purchase: '/purchases',
  Budget: '/budgets',
  Recibo: '/recibos',
  OrdenPago: '/orden-pagos',
  OrdenCompra: '/orden-compras',
  OrdenPedido: '/orden-pedidos',
  Remito: '/remitos',
  CashRegister: '/cash-registers',
  User: '/users',
};

const ENTITY_LABELS: Record<string, string> = {
  Invoice: 'Factura',
  Customer: 'Cliente',
  Product: 'Producto',
  Supplier: 'Proveedor',
  Warehouse: 'Almacén',
  Purchase: 'Compra',
  Budget: 'Presupuesto',
  Recibo: 'Recibo',
  OrdenPago: 'Orden de Pago',
  OrdenCompra: 'Orden de Compra',
  OrdenPedido: 'Orden de Pedido',
  Remito: 'Remito',
  CashRegister: 'Caja',
  Category: 'Categoría',
  Brand: 'Marca',
  Stock: 'Stock',
  StockMovement: 'Mov. Stock',
  User: 'Usuario',
  Afip: 'AFIP',
  MercadoPago: 'MercadoPago',
};

interface UserOption {
  id: string;
  name: string;
}

const inputCls =
  'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors';

export default function ActivityPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Filter options (loaded dynamically)
  const [entityOptions, setEntityOptions] = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);

  const [filters, setFilters] = useState<ActivityLogFilters>({
    entity: '',
    action: undefined,
    userId: '',
    search: '',
    dateFrom: '',
    dateTo: '',
  });

  // Load filter options once
  useEffect(() => {
    activityLogsService.getEntities().then(setEntityOptions).catch(() => {});
    usersService.getAll().then((users: any[]) => {
      setUserOptions(users.map((u) => ({ id: u.id, name: u.name })));
    }).catch(() => {});
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: ActivityLogFilters = { page, limit };
      if (filters.entity) params.entity = filters.entity;
      if (filters.action) params.action = filters.action;
      if (filters.userId) params.userId = filters.userId;
      if (filters.search) params.search = filters.search;
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
  }, [page, limit, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function handleFilterChange(key: keyof ActivityLogFilters, value: string) {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }

  function clearFilters() {
    setPage(1);
    setFilters({ entity: '', action: undefined, userId: '', search: '', dateFrom: '', dateTo: '' });
  }

  const hasActiveFilters = !!(filters.entity || filters.action || filters.userId || filters.search || filters.dateFrom || filters.dateTo);

  function exportCsv() {
    const headers = ['Fecha', 'Usuario', 'Email', 'Acción', 'Entidad', 'Descripción', 'ID Entidad'];
    const rows = logs.map((log) => [
      new Date(log.createdAt).toLocaleString('es-AR'),
      log.user?.name ?? '',
      log.user?.email ?? '',
      ACTION_LABELS[log.action],
      ENTITY_LABELS[log.entity] ?? log.entity,
      log.description,
      log.entityId,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial-actividad-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: Column<ActivityLog>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (log) => {
        const d = new Date(log.createdAt);
        return (
          <div className="whitespace-nowrap">
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-slate-300">
              <Clock className="w-3 h-3 text-gray-300 dark:text-slate-600 flex-shrink-0" />
              <span className="text-sm">{d.toLocaleDateString('es-AR')}</span>
            </div>
            <p className="text-xs text-gray-400 dark:text-slate-500 ml-[18px]">
              {d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        );
      },
    },
    {
      key: 'user',
      header: 'Usuario',
      render: (log) => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{log.user?.name ?? '—'}</p>
          {log.user?.email && (
            <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{log.user.email}</p>
          )}
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Acción',
      render: (log) => (
        <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ACTION_COLORS[log.action]}`}>
          {ACTION_LABELS[log.action]}
        </span>
      ),
    },
    {
      key: 'entity',
      header: 'Entidad',
      render: (log) => {
        const route = ENTITY_ROUTES[log.entity];
        const label = ENTITY_LABELS[log.entity] ?? log.entity;
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 px-1.5 py-0.5 rounded">
              {label}
            </span>
            {route && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate(`${route}/${log.entityId}`); }}
                className="text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                title="Ver entidad"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      },
    },
    {
      key: 'description',
      header: 'Descripción',
      render: (log) => (
        <div className="min-w-0">
          <p className="text-sm text-gray-600 dark:text-slate-300 truncate max-w-[300px]">{log.description}</p>
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <details className="mt-1">
              <summary className="text-[10px] text-gray-400 dark:text-slate-500 cursor-pointer hover:text-gray-600 dark:hover:text-slate-400">
                Metadata
              </summary>
              <pre className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 whitespace-pre-wrap max-w-[300px] break-all">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Historial de actividad"
        subtitle={`${total} registros en total`}
        actions={
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={logs.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Exportar CSV
          </Button>
        }
      />

      {/* Filters */}
      <Card padding="none">
        <div className="p-4 flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="w-64">
            <SearchInput
              value={filters.search ?? ''}
              onChange={(v) => handleFilterChange('search', v)}
              placeholder="Buscar en descripción…"
            />
          </div>

          {/* User */}
          <select
            value={filters.userId ?? ''}
            onChange={(e) => handleFilterChange('userId', e.target.value)}
            className={inputCls}
          >
            <option value="">Todos los usuarios</option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>

          {/* Entity */}
          <select
            value={filters.entity ?? ''}
            onChange={(e) => handleFilterChange('entity', e.target.value)}
            className={inputCls}
          >
            <option value="">Todas las entidades</option>
            {entityOptions.map((e) => (
              <option key={e} value={e}>{ENTITY_LABELS[e] ?? e}</option>
            ))}
          </select>

          {/* Action */}
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

          {/* Dates */}
          <input
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
            className={inputCls}
            title="Desde"
          />
          <input
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(e) => handleFilterChange('dateTo', e.target.value)}
            className={inputCls}
            title="Hasta"
          />

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors px-3 py-2"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        <DataTable
          columns={columns}
          data={logs}
          isLoading={loading}
          keyExtractor={(log) => log.id}
          emptyMessage={hasActiveFilters ? 'Sin resultados para los filtros aplicados' : 'No hay registros de actividad'}
          pagination={{
            page,
            totalPages,
            limit,
            total,
            onPageChange: setPage,
            onLimitChange: (l) => { setLimit(l); setPage(1); },
          }}
        />
      </Card>
    </div>
  );
}
