import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, Pagination, FeatureGuard } from '../../components/shared';
import { Badge, Button } from '../../components/ui';
import { accountingService } from '../../services/accounting.service';
import { formatDate } from '../../utils/formatters';
import type { JournalEntry } from '../../types/accounting.types';

const REF_TYPE_LABELS: Record<string, string> = {
  INVOICE:  'Factura',
  PAYMENT:  'Cobro',
  PURCHASE: 'Compra',
  MANUAL:   'Manual',
};

const REF_TYPE_VARIANT: Record<string, 'success' | 'default' | 'info' | 'warning'> = {
  INVOICE:  'info',
  PAYMENT:  'success',
  PURCHASE: 'warning',
  MANUAL:   'default',
};

const REF_TYPE_OPTIONS = [
  { value: '',         label: 'Todos los tipos' },
  { value: 'INVOICE',  label: 'Facturas' },
  { value: 'PAYMENT',  label: 'Cobros' },
  { value: 'PURCHASE', label: 'Compras' },
  { value: 'MANUAL',   label: 'Manuales' },
];

const selectCls =
  'px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30';

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <td key={i} className="px-5 py-3.5">
          <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded" />
        </td>
      ))}
    </tr>
  );
}

function JournalEntriesPageContent() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [refTypeFilter, setRefTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const hasFilters = !!(refTypeFilter || dateFrom || dateTo);

  const clearFilters = () => {
    setRefTypeFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const fetchEntries = async () => {
    setIsLoading(true);
    try {
      const result = await accountingService.getJournalEntries({
        page,
        limit,
        referenceType: refTypeFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setEntries(result.data);
      setTotal(result.total);
      setTotalPages(Math.ceil(result.total / limit));
    } catch {
      toast.error('Error al cargar los asientos contables');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchEntries(); }, [page, refTypeFilter, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asientos Contables"
        subtitle={`${total} asiento${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}`}
        actions={
          <Button onClick={() => navigate('/accounting/journal-entries/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo asiento
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={refTypeFilter}
          onChange={(e) => { setRefTypeFilter(e.target.value); setPage(1); }}
          className={selectCls}
        >
          {REF_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className={selectCls}
          placeholder="Desde"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className={selectCls}
          placeholder="Hasta"
        />

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
            Limpiar
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
            <tr>
              {['Número', 'Fecha', 'Descripción', 'Tipo', 'Referencia'].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-gray-400 dark:text-slate-500">
                  No hay asientos contables
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/accounting/journal-entries/${entry.id}`)}
                >
                  <td className="px-5 py-3.5 font-mono text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                    {entry.number}
                  </td>
                  <td className="px-5 py-3.5 text-gray-600 dark:text-slate-400">
                    {formatDate(entry.date)}
                  </td>
                  <td className="px-5 py-3.5 text-gray-800 dark:text-slate-200">
                    {entry.description}
                  </td>
                  <td className="px-5 py-3.5">
                    {entry.referenceType ? (
                      <Badge variant={(REF_TYPE_VARIANT[entry.referenceType] ?? 'default') as any}>
                        {REF_TYPE_LABELS[entry.referenceType] ?? entry.referenceType}
                      </Badge>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-gray-400 dark:text-slate-500">
                    {entry.referenceId ? entry.referenceId.slice(0, 8) + '…' : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          limit={limit}
          total={total}
          onPageChange={setPage}
          onLimitChange={() => {}}
        />
      )}
    </div>
  );
}

export default function JournalEntriesPage() {
  return (
    <FeatureGuard feature="accounting">
      <JournalEntriesPageContent />
    </FeatureGuard>
  );
}
