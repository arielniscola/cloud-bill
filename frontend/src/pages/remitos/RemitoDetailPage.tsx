import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  XCircle, Truck, CheckCircle, ArrowRight, FileText, Calculator, FileDown, Mail,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { pdf } from '@react-pdf/renderer';
import { Badge, Button, Modal, Input } from '../../components/ui';
import { PageHeader, ConfirmDialog, SendEmailModal } from '../../components/shared';
import { remitosService, afipService } from '../../services';
import { formatDate } from '../../utils/formatters';
import { REMITO_STATUSES } from '../../utils/constants';
import type { Remito } from '../../types';
import RemitoPDF from '../../components/pdf/RemitoPDF';

type StatusVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

const STATUS_VARIANT: Record<string, StatusVariant> = {
  PENDING: 'warning',
  PARTIALLY_DELIVERED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'error',
};

function SkeletonDetail() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
          <div className="h-5 bg-gray-100 dark:bg-slate-700 rounded w-16" />
          {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />)}
        </div>
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-20" />
                <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RemitoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [remito, setRemito] = useState<Remito | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [showDeliverModal, setShowDeliverModal] = useState(false);
  const [isDelivering, setIsDelivering] = useState(false);
  const [deliverQuantities, setDeliverQuantities] = useState<Record<string, number>>({});
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const handleDownloadPDF = async () => {
    if (!remito) return;
    setIsGeneratingPDF(true);
    try {
      const afipConfig = await afipService.getConfig();
      const blob = await pdf(<RemitoPDF remito={remito} afipConfig={afipConfig} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `remito-${remito.number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast.error(err.message || 'Error al generar PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    remitosService.getById(id)
      .then(setRemito)
      .catch(() => { toast.error('Error al cargar remito'); navigate('/remitos'); })
      .finally(() => setIsLoading(false));
  }, [id, navigate]);

  const openDeliverModal = () => {
    if (!remito) return;
    const initial: Record<string, number> = {};
    remito.items.forEach((item) => {
      const pending = Number(item.quantity) - Number(item.deliveredQuantity);
      if (pending > 0) initial[item.id] = pending;
    });
    setDeliverQuantities(initial);
    setShowDeliverModal(true);
  };

  const handleDeliver = async () => {
    if (!id || !remito) return;
    setIsDelivering(true);
    try {
      const items = Object.entries(deliverQuantities)
        .filter(([, qty]) => qty > 0)
        .map(([remitoItemId, quantity]) => ({ remitoItemId, quantity }));
      if (items.length === 0) {
        toast.error('Ingresá al menos una cantidad a entregar');
        setIsDelivering(false);
        return;
      }
      const updated = await remitosService.deliver(id, { items });
      setRemito(updated);
      toast.success('Entrega registrada');
      setShowDeliverModal(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al registrar entrega');
    } finally {
      setIsDelivering(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    setIsCanceling(true);
    try {
      const updated = await remitosService.cancel(id);
      setRemito(updated);
      toast.success('Remito cancelado');
      setShowCancelDialog(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al cancelar remito');
    } finally {
      setIsCanceling(false);
    }
  };

  if (isLoading || !remito) {
    return (
      <div>
        <PageHeader title="Remito" backTo="/remitos" />
        <SkeletonDetail />
      </div>
    );
  }

  const canDeliver = remito.status === 'PENDING' || remito.status === 'PARTIALLY_DELIVERED';
  const canCancel = remito.status !== 'CANCELLED' && remito.status !== 'DELIVERED';
  const isCancelled = remito.status === 'CANCELLED';
  const isReserve = remito.stockBehavior === 'RESERVE';

  const pendingItems = remito.items.filter(
    (item) => Number(item.quantity) - Number(item.deliveredQuantity) > 0
  );

  return (
    <div>
      <PageHeader
        title={`Remito ${remito.number}`}
        backTo="/remitos"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleDownloadPDF} isLoading={isGeneratingPDF}>
              <FileDown className="w-4 h-4 mr-2" />
              PDF
            </Button>
            <Button variant="outline" onClick={() => setShowEmailModal(true)}>
              <Mail className="w-4 h-4 mr-2" />
              Enviar
            </Button>
            {canDeliver && (
              <Button onClick={openDeliverModal}>
                <Truck className="w-4 h-4 mr-2" />
                Registrar entrega
              </Button>
            )}
            {canCancel && (
              <Button variant="danger" onClick={() => setShowCancelDialog(true)}>
                <XCircle className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
            )}
          </div>
        }
      />

      {/* Status strip — only for RESERVE remitos */}
      {isReserve && !isCancelled && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {(['PENDING', 'PARTIALLY_DELIVERED', 'DELIVERED'] as const).map((step, i, arr) => {
            const labels: Record<string, string> = {
              PENDING: 'Pendiente',
              PARTIALLY_DELIVERED: 'Parcial',
              DELIVERED: 'Entregado',
            };
            const order = ['PENDING', 'PARTIALLY_DELIVERED', 'DELIVERED'];
            const currentIdx = order.indexOf(remito.status);
            const stepIdx = order.indexOf(step);
            const isDone = stepIdx < currentIdx;
            const isCurrent = stepIdx === currentIdx;
            return (
              <div key={step} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors duration-200 ${
                  isCurrent ? 'bg-indigo-600 text-white' :
                  isDone ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                  'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
                }`}>
                  {isDone && <CheckCircle className="w-3.5 h-3.5" />}
                  {labels[step]}
                </div>
                {i < arr.length - 1 && (
                  <ArrowRight className={`w-3 h-3 flex-shrink-0 ${stepIdx < currentIdx ? 'text-emerald-400' : 'text-gray-300 dark:text-slate-600'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delivered immediately badge */}
      {!isReserve && !isCancelled && (
        <div className="mb-6">
          <Badge variant="success" dot>Entregado inmediatamente</Badge>
        </div>
      )}

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-800 dark:text-red-400">
          <XCircle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" />
          Este remito fue cancelado.
        </div>
      )}

      {/* Source document banner */}
      {(remito.invoiceId || remito.budgetId) && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-xl text-sm text-indigo-800 dark:text-indigo-300">
          {remito.invoiceId
            ? <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
            : <Calculator className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
          }
          <span>
            Generado desde{' '}
            {remito.invoiceId && remito.invoice ? (
              <>
                <span className="font-medium">Factura</span>
                {' '}
                <button
                  onClick={() => navigate(`/invoices/${remito.invoiceId}`)}
                  className="font-semibold underline hover:no-underline transition-all duration-150"
                >
                  {remito.invoice.number}
                </button>
              </>
            ) : remito.budgetId && remito.budget ? (
              <>
                <span className="font-medium">Presupuesto</span>
                {' '}
                <button
                  onClick={() => navigate(`/budgets/${remito.budgetId}`)}
                  className="font-semibold underline hover:no-underline transition-all duration-150"
                >
                  {remito.budget.number}
                </button>
              </>
            ) : 'un documento'}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">

        {/* ── Left: items table + notes ── */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Ítems</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50/80 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Producto</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Cantidad</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Entregado</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Pendiente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {remito.items.map((item) => {
                    const pending = Number(item.quantity) - Number(item.deliveredQuantity);
                    return (
                      <tr key={item.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-700 transition-colors duration-100">
                        <td className="px-5 py-3.5">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {item.product?.name ?? <span className="text-gray-400 dark:text-slate-500 italic text-xs">Producto eliminado</span>}
                          </p>
                          {item.product?.sku && (
                            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{item.product.sku}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-slate-300 text-right tabular-nums">
                          {Number(item.quantity)}
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums">
                          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                            {Number(item.deliveredQuantity)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums">
                          <span className={`text-sm font-semibold ${pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {pending}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {remito.notes && (
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-5 py-4">
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Notas</p>
              <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">{remito.notes}</p>
            </div>
          )}
        </div>

        {/* ── Right: info sidebar ── */}
        <div className="space-y-4">
          {/* Main info */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Información</p>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Estado</span>
                <Badge variant={STATUS_VARIANT[remito.status] ?? 'default'} dot>
                  {REMITO_STATUSES[remito.status]}
                </Badge>
              </div>
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Fecha</span>
                <span className="text-sm text-gray-900 dark:text-white tabular-nums">{formatDate(remito.date)}</span>
              </div>
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Stock</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {remito.stockBehavior === 'DISCOUNT' ? 'Descontado' : 'Reservado'}
                </span>
              </div>
            </div>
          </div>

          {/* Client */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Cliente</p>
            </div>
            <div className="px-5 py-4 space-y-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{remito.customer?.name ?? '—'}</p>
              {remito.customer?.taxId && (
                <p className="text-xs text-gray-500 dark:text-slate-400">CUIT: {remito.customer.taxId}</p>
              )}
              {remito.customer?.email && (
                <p className="text-xs text-gray-500 dark:text-slate-400">{remito.customer.email}</p>
              )}
              {remito.customer?.address && (
                <p className="text-xs text-gray-400 dark:text-slate-500">{remito.customer.address}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Deliver Modal */}
      <Modal
        isOpen={showDeliverModal}
        onClose={() => setShowDeliverModal(false)}
        title="Registrar entrega"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Ingresá la cantidad a entregar para cada ítem. Dejá en 0 los que no se entregan ahora.
          </p>
          <div className="space-y-2">
            {pendingItems.map((item) => {
              const pending = Number(item.quantity) - Number(item.deliveredQuantity);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-4 py-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-100 dark:border-slate-700"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {item.product?.name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Pendiente: {pending}</p>
                  </div>
                  <div className="w-28 flex-shrink-0">
                    <Input
                      type="number"
                      min={0}
                      max={pending}
                      value={deliverQuantities[item.id] ?? 0}
                      onChange={(e) =>
                        setDeliverQuantities((prev) => ({
                          ...prev,
                          [item.id]: Math.min(Number(e.target.value), pending),
                        }))
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="outline" onClick={() => setShowDeliverModal(false)} disabled={isDelivering}>
              Cancelar
            </Button>
            <Button onClick={handleDeliver} isLoading={isDelivering}>
              <Truck className="w-4 h-4 mr-2" />
              Confirmar entrega
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancel}
        title="Cancelar remito"
        message="¿Estás seguro de que deseas cancelar este remito? Esta acción revertirá los movimientos de stock y reservas asociados."
        confirmText="Cancelar remito"
        isLoading={isCanceling}
      />

      <SendEmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        defaultEmail={(remito as any)?.customer?.email ?? ''}
        documentLabel={remito ? `Remito ${remito.number}` : ''}
        onSend={async (to) => {
          await remitosService.sendEmail(remito!.id, to);
          toast.success('Correo enviado correctamente');
        }}
      />
    </div>
  );
}
