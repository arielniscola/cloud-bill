import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { XCircle, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { recibosService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PAYMENT_METHODS, RECIBO_STATUSES } from '../../utils/constants';
import type { Recibo } from '../../types';

function SkeletonDetail() {
  return (
    <div className="animate-pulse space-y-6 max-w-xl mx-auto">
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex justify-between">
            <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-24" />
            <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReciboDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [recibo, setRecibo] = useState<Recibo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      if (!id) return;
      try {
        const data = await recibosService.getById(id);
        setRecibo(data);
      } catch {
        toast.error('Error al cargar recibo');
        navigate('/recibos');
      } finally {
        setIsLoading(false);
      }
    };
    fetch();
  }, [id, navigate]);

  const handleCancel = async () => {
    if (!id) return;
    setIsCancelling(true);
    try {
      const updated = await recibosService.cancel(id);
      setRecibo(updated);
      toast.success('Recibo cancelado');
      setShowCancelDialog(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al cancelar recibo');
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading || !recibo) return (
    <div>
      <PageHeader title="Recibo" backTo="/recibos" />
      <SkeletonDetail />
    </div>
  );

  return (
    <div>
      <PageHeader
        title={`Recibo ${recibo.number}`}
        backTo="/recibos"
        actions={
          recibo.status === 'EMITTED' ? (
            <Button variant="danger" onClick={() => setShowCancelDialog(true)}>
              <XCircle className="w-4 h-4 mr-2" />
              Cancelar recibo
            </Button>
          ) : undefined
        }
      />

      {recibo.status === 'CANCELLED' && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-800 dark:text-red-400">
          <XCircle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" />
          Este recibo fue cancelado.
        </div>
      )}

      <div className="max-w-xl">
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
            <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Datos del recibo</p>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            <div className="flex justify-between items-center px-5 py-3">
              <span className="text-sm text-gray-500 dark:text-slate-400">Número</span>
              <span className="text-sm font-mono font-semibold text-indigo-600 dark:text-indigo-400">{recibo.number}</span>
            </div>
            <div className="flex justify-between items-center px-5 py-3">
              <span className="text-sm text-gray-500 dark:text-slate-400">Estado</span>
              <Badge variant={recibo.status === 'EMITTED' ? 'success' : 'error'} dot>
                {RECIBO_STATUSES[recibo.status]}
              </Badge>
            </div>
            <div className="flex justify-between items-center px-5 py-3">
              <span className="text-sm text-gray-500 dark:text-slate-400">Fecha</span>
              <span className="text-sm tabular-nums text-gray-900 dark:text-white">{formatDate(recibo.date)}</span>
            </div>
            <div className="flex justify-between items-center px-5 py-3">
              <span className="text-sm text-gray-500 dark:text-slate-400">Monto</span>
              <span className="text-base font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                {formatCurrency(Number(recibo.amount), recibo.currency)}
              </span>
            </div>
            {recibo.currency === 'USD' && Number(recibo.exchangeRate) > 1 && (
              <>
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Cotización</span>
                  <span className="text-sm tabular-nums text-gray-900 dark:text-white">
                    {Number(recibo.exchangeRate).toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS/USD
                  </span>
                </div>
                <div className="flex justify-between items-center px-5 py-3 bg-indigo-50 dark:bg-indigo-900/20">
                  <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Equivalente en ARS</span>
                  <span className="text-base font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
                    {formatCurrency(Number(recibo.amount) * Number(recibo.exchangeRate), 'ARS')}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center px-5 py-3">
              <span className="text-sm text-gray-500 dark:text-slate-400">Método de pago</span>
              <span className="text-sm text-gray-900 dark:text-white">{PAYMENT_METHODS[recibo.paymentMethod] ?? recibo.paymentMethod}</span>
            </div>
            {recibo.reference && (
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Referencia</span>
                <span className="text-sm font-mono text-gray-900 dark:text-white">{recibo.reference}</span>
              </div>
            )}
            {recibo.bank && (
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Banco</span>
                <span className="text-sm text-gray-900 dark:text-white">{recibo.bank}</span>
              </div>
            )}
            {recibo.checkDueDate && (
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Vto. cheque</span>
                <span className="text-sm tabular-nums text-gray-900 dark:text-white">{formatDate(recibo.checkDueDate)}</span>
              </div>
            )}
            {recibo.installments && (
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Cuotas</span>
                <span className="text-sm text-gray-900 dark:text-white">{recibo.installments}</span>
              </div>
            )}
            {recibo.cashRegister && (
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Caja</span>
                <span className="text-sm text-gray-900 dark:text-white">{recibo.cashRegister.name}</span>
              </div>
            )}
            <div className="flex justify-between items-center px-5 py-3">
              <span className="text-sm text-gray-500 dark:text-slate-400">Cliente</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{recibo.customer?.name ?? '—'}</span>
            </div>

            {/* Links to related documents */}
            {recibo.invoice && (
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Factura</span>
                <button
                  onClick={() => navigate(`/invoices/${recibo.invoiceId}`)}
                  className="flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                >
                  {recibo.invoice.number}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {recibo.budget && (
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Presupuesto</span>
                <button
                  onClick={() => navigate(`/budgets/${recibo.budgetId}`)}
                  className="flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                >
                  {recibo.budget.number}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {recibo.ordenPedido && (
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Orden de pedido</span>
                <button
                  onClick={() => navigate(`/orden-pedidos/${recibo.ordenPedidoId}`)}
                  className="flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                >
                  {recibo.ordenPedido.number}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {recibo.notes && (
              <div className="px-5 py-3">
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">Notas</p>
                <p className="text-sm text-gray-700 dark:text-slate-300">{recibo.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancel}
        title="Cancelar recibo"
        message={`¿Estás seguro de que deseas cancelar el recibo ${recibo.number}? Esto revertirá el movimiento de cuenta corriente asociado y actualizará el estado del documento vinculado.`}
        confirmText="Cancelar recibo"
        isLoading={isCancelling}
      />
    </div>
  );
}
