import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Badge } from '../../components/ui';
import { PageHeader, SearchInput, Pagination } from '../../components/shared';
import { recibosService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PAYMENT_METHODS, RECIBO_STATUSES, RECIBO_STATUS_OPTIONS } from '../../utils/constants';
import type { Recibo } from '../../types';

const STATUS_VARIANT: Record<string, 'success' | 'error' | 'default'> = {
  EMITTED: 'success',
  CANCELLED: 'error',
};

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <td key={i} className="px-5 py-3.5">
          <div className="h-4 bg-gray-100 rounded" />
        </td>
      ))}
    </tr>
  );
}

export default function RecibosPage() {
  const navigate = useNavigate();
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');

  const LIMIT = 20;

  const fetchRecibos = async () => {
    setIsLoading(true);
    try {
      const result = await recibosService.getAll({
        page,
        limit: LIMIT,
        status: statusFilter as any || undefined,
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
    fetchRecibos();
  }, [page, statusFilter]);

  return (
    <div>
      <PageHeader
        title="Recibos"
        subtitle={`${total} recibos en total`}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        >
          <option value="">Todos los estados</option>
          {RECIBO_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50/80">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">N°</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Vinculado a</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Cliente</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Fecha</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Monto</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Método</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                : recibos.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">
                      No hay recibos
                    </td>
                  </tr>
                )
                : recibos.map((recibo) => (
                  <tr
                    key={recibo.id}
                    className={`hover:bg-gray-50/60 transition-colors duration-100 cursor-pointer ${recibo.status === 'CANCELLED' ? 'opacity-60' : ''}`}
                    onClick={() => navigate(`/recibos/${recibo.id}`)}
                  >
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-mono font-medium text-indigo-600">
                        {recibo.number}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-700">
                      {recibo.invoice
                        ? <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">Factura {recibo.invoice.number}</span>
                        : recibo.budget
                        ? <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">Presupuesto {recibo.budget.number}</span>
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-900">
                      {recibo.customer?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 tabular-nums">
                      {formatDate(recibo.date)}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 text-right tabular-nums">
                      {formatCurrency(Number(recibo.amount), recibo.currency)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">
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
          <div className="px-5 py-4 border-t border-gray-100">
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
