import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Repeat, Play, Pencil, Trash2, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, Card } from '../../components/ui';
import { PageHeader, ConfirmDialog, Pagination } from '../../components/shared';
import { recurringInvoicesService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { INVOICE_TYPES } from '../../utils/constants';
import { RECURRING_FREQUENCY_LABELS, type RecurringInvoice } from '../../types/recurring-invoice.types';

export default function RecurringInvoicesPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<RecurringInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await recurringInvoicesService.getAll({ page, limit: 20 });
      setData(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      toast.error('Error al cargar abonos');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [page]);

  const handleRunNow = async (rec: RecurringInvoice) => {
    setRunningId(rec.id);
    try {
      const invoice = await recurringInvoicesService.runNow(rec.id);
      toast.success(`Factura ${invoice.number} generada en borrador`);
      navigate(`/invoices/${invoice.id}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al generar la factura');
    } finally {
      setRunningId(null);
    }
  };

  const handleToggle = async (rec: RecurringInvoice) => {
    setTogglingId(rec.id);
    try {
      await recurringInvoicesService.update(rec.id, { isActive: !rec.isActive });
      toast.success(rec.isActive ? 'Abono pausado' : 'Abono reactivado');
      await loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al actualizar');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await recurringInvoicesService.delete(deleteId);
      toast.success('Abono eliminado');
      setDeleteId(null);
      await loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al eliminar');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Abonos"
        subtitle="Facturación recurrente: cada abono genera su factura en borrador automáticamente"
        actions={
          <Button onClick={() => navigate('/recurring-invoices/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo abono
          </Button>
        }
      />

      <Card padding="none">
        {isLoading ? (
          <div className="p-8 space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-lg" />)}
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-14">
            <Repeat className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">Todavía no hay abonos</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">
              Creá uno para facturar automáticamente todos los meses (hosting, cuotas, servicios).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                <tr>
                  {['Abono', 'Cliente', 'Tipo', 'Frecuencia', 'Próxima factura', 'Última', 'Generadas', 'Estado', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                {data.map((rec) => {
                  const overdue = rec.isActive && new Date(rec.nextRunAt) <= new Date();
                  return (
                    <tr key={rec.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/20">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white">{rec.name}</p>
                        {rec.useCurrentPrices && (
                          <p className="text-[11px] text-gray-400 dark:text-slate-500">precio de lista al generar</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-slate-300">{rec.customer?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">{INVOICE_TYPES[rec.type]}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-slate-300 whitespace-nowrap">
                        {RECURRING_FREQUENCY_LABELS[rec.frequency]}
                        {rec.dayOfMonth ? <span className="text-xs text-gray-400 dark:text-slate-500"> · día {rec.dayOfMonth}</span> : null}
                      </td>
                      <td className={`px-4 py-3 tabular-nums whitespace-nowrap ${overdue ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-700 dark:text-slate-300'}`}>
                        {rec.isActive ? formatDate(rec.nextRunAt) : '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-500 dark:text-slate-400 whitespace-nowrap">
                        {rec.lastRunAt ? formatDate(rec.lastRunAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-slate-300">{rec.generatedCount}</td>
                      <td className="px-4 py-3">
                        <Badge variant={rec.isActive ? 'success' : 'default'} dot>
                          {rec.isActive ? 'Activo' : 'Pausado'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <Button
                            variant="outline" size="sm"
                            isLoading={runningId === rec.id}
                            onClick={() => handleRunNow(rec)}
                            title="Generar factura ahora"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="outline" size="sm"
                            isLoading={togglingId === rec.id}
                            onClick={() => handleToggle(rec)}
                            title={rec.isActive ? 'Pausar' : 'Reactivar'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="outline" size="sm"
                            onClick={() => navigate(`/recurring-invoices/${rec.id}/edit`)}
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="outline" size="sm"
                            onClick={() => setDeleteId(rec.id)}
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="mt-4">
          <Pagination currentPage={page} totalPages={totalPages} totalItems={total} onPageChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar abono"
        message="¿Eliminar este abono? Las facturas ya generadas se conservan; solo deja de generarse la próxima."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
