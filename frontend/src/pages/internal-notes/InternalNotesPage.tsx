import { useState, useEffect, useCallback } from 'react';
import { X, Plus, FileEdit, CheckCircle2, XCircle, TrendingUp, TrendingDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Button, Badge } from '../../components/ui';
import { PageHeader, Pagination, CustomerSearchSelect, ConfirmDialog } from '../../components/shared';
import { internalNotesService, customersService, suppliersService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { usePermissions } from '../../hooks/usePermissions';
import type { InternalNote, InternalNoteType, InternalNoteStatus, Customer, Supplier } from '../../types';
import CreateInternalNoteModal from './CreateInternalNoteModal';

const TYPE_LABEL: Record<InternalNoteType, string> = {
  DEBIT:  'Nota de Débito',
  CREDIT: 'Nota de Crédito',
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

export default function InternalNotesPage() {
  const { canWrite } = usePermissions();

  const [notes,      setNotes]      = useState<InternalNote[]>([]);
  const [customers,  setCustomers]  = useState<Customer[]>([]);
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [page,       setPage]       = useState(1);
  const [limit]                     = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total,      setTotal]      = useState(0);

  // Filters
  const [typeFilter,     setTypeFilter]     = useState('');
  const [statusFilter,   setStatusFilter]   = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [entityFilter,   setEntityFilter]   = useState<'' | 'CUSTOMER' | 'SUPPLIER'>('');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');

  const [showModal,    setShowModal]    = useState(false);
  const [cancelId,     setCancelId]     = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const hasFilters = !!(typeFilter || statusFilter || customerFilter || supplierFilter || entityFilter || dateFrom || dateTo);

  const clearFilters = () => {
    setTypeFilter('');
    setStatusFilter('');
    setCustomerFilter('');
    setSupplierFilter('');
    setEntityFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const fetchNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await internalNotesService.getAll({
        page,
        limit,
        type:       typeFilter       as InternalNoteType | '' || undefined,
        status:     statusFilter     as InternalNoteStatus | '' || undefined,
        customerId: customerFilter   || undefined,
        supplierId: supplierFilter   || undefined,
        dateFrom:   dateFrom         || undefined,
        dateTo:     dateTo           || undefined,
      });
      setNotes(result.data);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch {
      toast.error('Error al cargar las notas internas');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, typeFilter, statusFilter, customerFilter, supplierFilter, dateFrom, dateTo]);

  useEffect(() => {
    customersService.getAll({ limit: 500 })
      .then((r) => setCustomers(r.data))
      .catch(() => {});
    suppliersService.getAll({ limit: 500 })
      .then((r) => setSuppliers(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const handleCreated = () => {
    setShowModal(false);
    fetchNotes();
    toast.success('Nota interna creada');
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    setIsCancelling(true);
    try {
      await internalNotesService.cancel(cancelId);
      toast.success('Nota interna anulada');
      setCancelId(null);
      fetchNotes();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al anular');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notas Internas"
        subtitle={`${total} nota${total !== 1 ? 's' : ''}`}
        actions={
          canWrite && (
            <Button size="sm" onClick={() => setShowModal(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Nueva nota
            </Button>
          )
        }
      />

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <select className={selectCls} value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
            <option value="">Todos los tipos</option>
            <option value="DEBIT">Nota de Débito</option>
            <option value="CREDIT">Nota de Crédito</option>
          </select>
          <select className={selectCls} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">Todos los estados</option>
            <option value="ACTIVE">Activa</option>
            <option value="CANCELLED">Anulada</option>
          </select>
          <select
            className={selectCls}
            value={entityFilter}
            onChange={(e) => {
              const v = e.target.value as '' | 'CUSTOMER' | 'SUPPLIER';
              setEntityFilter(v);
              if (v !== 'CUSTOMER') setCustomerFilter('');
              if (v !== 'SUPPLIER') setSupplierFilter('');
              setPage(1);
            }}
          >
            <option value="">Clientes y proveedores</option>
            <option value="CUSTOMER">Solo clientes</option>
            <option value="SUPPLIER">Solo proveedores</option>
          </select>
          {entityFilter !== 'SUPPLIER' && (
            <div className="w-64">
              <CustomerSearchSelect
                customers={customers}
                value={customerFilter}
                onChange={(v) => { setCustomerFilter(v); setPage(1); }}
                placeholder="Filtrar por cliente"
                clearLabel="Todos los clientes"
              />
            </div>
          )}
          {entityFilter === 'SUPPLIER' && (
            <select
              className={selectCls}
              value={supplierFilter}
              onChange={(e) => { setSupplierFilter(e.target.value); setPage(1); }}
            >
              <option value="">Todos los proveedores</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <input
            type="date" className={selectCls}
            value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
          <input
            type="date" className={selectCls}
            value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
              <X className="w-4 h-4" /> Limpiar
            </button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Número</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Tipo</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Cliente / Proveedor</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Motivo</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Monto</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Fecha</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Estado</th>
                {canWrite && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : notes.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 8 : 7} className="px-5 py-10 text-center text-gray-400 dark:text-slate-500">
                    No hay notas internas
                  </td>
                </tr>
              ) : (
                notes.map((note) => (
                  <tr key={note.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs font-semibold text-gray-700 dark:text-slate-300">{note.number}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                        note.type === 'DEBIT'
                          ? 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800'
                          : 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800'
                      }`}>
                        {note.type === 'DEBIT'
                          ? <TrendingUp className="w-3 h-3" />
                          : <TrendingDown className="w-3 h-3" />
                        }
                        {TYPE_LABEL[note.type]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-700 dark:text-slate-300">
                      {note.customer?.name ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-wide text-indigo-500 font-semibold">Cliente</span>
                          {note.customer.name}
                        </span>
                      ) : note.supplier?.name ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold">Proveedor</span>
                          {note.supplier.name}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 dark:text-slate-400 max-w-[220px] truncate">
                      {note.reason}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                      {formatCurrency(note.amount, note.currency)}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 dark:text-slate-400 text-xs">
                      {formatDate(note.createdAt)}
                    </td>
                    <td className="px-5 py-3.5">
                      {note.status === 'ACTIVE' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                          <XCircle className="w-3 h-3" /> Anulada
                        </span>
                      )}
                    </td>
                    {canWrite && (
                      <td className="px-5 py-3.5 text-right">
                        {note.status === 'ACTIVE' && (
                          <button
                            onClick={() => setCancelId(note.id)}
                            className="text-xs text-red-500 hover:text-red-700 hover:underline"
                          >
                            Anular
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-700">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </Card>

      {/* Create modal */}
      {showModal && (
        <CreateInternalNoteModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Cancel confirm */}
      <ConfirmDialog
        isOpen={!!cancelId}
        title="Anular nota interna"
        message="Se revertirá el movimiento en la cuenta corriente del cliente o proveedor. ¿Confirmás?"
        confirmLabel="Anular"
        variant="danger"
        isLoading={isCancelling}
        onConfirm={handleCancel}
        onCancel={() => setCancelId(null)}
      />
    </div>
  );
}
