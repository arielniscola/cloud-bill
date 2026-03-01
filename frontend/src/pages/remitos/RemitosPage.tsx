import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, X, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge, Card, Select } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import Pagination from '../../components/shared/Pagination';
import { remitosService } from '../../services';
import { formatDate } from '../../utils/formatters';
import {
  REMITO_STATUSES,
  REMITO_STATUS_OPTIONS,
  DEFAULT_PAGE_SIZE,
} from '../../utils/constants';
import type { Remito, RemitoStatus } from '../../types';

type StatusVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

const STATUS_VARIANT: Record<string, StatusVariant> = {
  PENDING: 'warning',
  PARTIALLY_DELIVERED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'error',
};

const BEHAVIOR_CHIP = {
  DISCOUNT: { label: 'Inmediata', cls: 'text-emerald-700 bg-emerald-50 ring-emerald-200/60' },
  RESERVE:  { label: 'Reserva',  cls: 'text-sky-700 bg-sky-50 ring-sky-200/60' },
};

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="animate-pulse border-b border-gray-100 last:border-0">
          <td className="px-4 py-4"><div className="h-4 bg-gray-100 rounded-md w-32" /></td>
          <td className="px-4 py-4"><div className="h-5 bg-gray-100 rounded-full w-20" /></td>
          <td className="px-4 py-4"><div className="h-4 bg-gray-100 rounded-md w-44" /></td>
          <td className="px-4 py-4"><div className="h-4 bg-gray-100 rounded-md w-20" /></td>
          <td className="px-4 py-4"><div className="h-5 bg-gray-100 rounded-full w-24 mx-auto" /></td>
          <td className="px-4 py-4" />
        </tr>
      ))}
    </>
  );
}

export default function RemitosPage() {
  const navigate = useNavigate();
  const [remitos, setRemitos] = useState<Remito[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const fetchRemitos = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await remitosService.getAll({
        page, limit,
        status: (statusFilter || undefined) as RemitoStatus | undefined,
      });
      setRemitos(response.data);
      setTotal(response.total);
    } catch {
      toast.error('Error al cargar remitos');
    } finally {
      setIsLoading(false);
      setIsFirstLoad(false);
    }
  }, [page, limit, statusFilter]);

  useEffect(() => { fetchRemitos(); }, [fetchRemitos]);

  const statusOptions = [{ value: '', label: 'Todos los estados' }, ...REMITO_STATUS_OPTIONS];
  const hasFilters = !!statusFilter;

  const showSkeleton = isFirstLoad && isLoading;
  const showEmpty = !isLoading && !isFirstLoad && remitos.length === 0;

  return (
    <div>
      <PageHeader
        title="Remitos"
        subtitle={total > 0 ? `${total} remitos registrados` : undefined}
        actions={
          <Button onClick={() => navigate('/remitos/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo remito
          </Button>
        }
      />

      <Card padding="none">
        {/* Filters */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-48">
              <Select
                options={statusOptions}
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setPage(1); }}
              />
            </div>
            {hasFilters && (
              <button
                onClick={() => { setStatusFilter(''); setPage(1); }}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors duration-150"
              >
                <X className="w-3.5 h-3.5" />
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Skeleton */}
        {showSkeleton && (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50/80">
                <tr>
                  {['Número', 'Tipo', 'Cliente', 'Fecha', 'Estado', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                <SkeletonRows count={8} />
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state */}
        {showEmpty && (
          <div className="py-20 flex flex-col items-center text-center px-4">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
              <ClipboardList className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-800 mb-1">
              {hasFilters ? 'Sin resultados' : 'Sin remitos todavía'}
            </p>
            <p className="text-sm text-gray-400 mb-5 max-w-xs">
              {hasFilters
                ? 'Probá ajustando los filtros para encontrar lo que buscás.'
                : 'Creá tu primer remito para registrar entregas de mercadería.'}
            </p>
            {!hasFilters && (
              <Button onClick={() => navigate('/remitos/new')}>
                <Plus className="w-4 h-4 mr-2" />
                Nuevo remito
              </Button>
            )}
          </div>
        )}

        {/* Data table */}
        {!showSkeleton && !showEmpty && (
          <div className={`transition-opacity duration-200 ${isLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Número</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Tipo entrega</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Cliente</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Fecha</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {remitos.map((rem) => {
                    const chip = BEHAVIOR_CHIP[rem.stockBehavior];
                    return (
                      <tr
                        key={rem.id}
                        className="cursor-pointer hover:bg-gray-50/80 transition-colors duration-150 group"
                        onClick={() => navigate(`/remitos/${rem.id}`)}
                      >
                        <td className="px-4 py-3.5 text-sm font-semibold text-gray-900 tabular-nums">{rem.number}</td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ring-1 ring-inset ${chip.cls}`}>
                            {chip.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-gray-700">
                          {rem.customer?.name ?? <span className="text-gray-400 italic text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-gray-500 tabular-nums">{formatDate(rem.date)}</td>
                        <td className="px-4 py-3.5 text-center">
                          <Badge variant={STATUS_VARIANT[rem.status] ?? 'default'} dot>
                            {REMITO_STATUSES[rem.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/remitos/${rem.id}`); }}
                            className="p-1.5 rounded-lg text-gray-300 group-hover:text-gray-500 hover:bg-gray-100 transition-colors duration-150"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {total > limit && (
              <Pagination
                page={page}
                totalPages={Math.ceil(total / limit)}
                limit={limit}
                total={total}
                onPageChange={setPage}
                onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
              />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
