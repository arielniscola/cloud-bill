import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Pencil, CheckCircle, XCircle, FileText, Trash2, ArrowRight, ChevronDown, Banknote, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, Modal, Select } from '../../components/ui';
import { PageHeader, ConfirmDialog, PaymentModal, RecibosList } from '../../components/shared';
import { ordenPedidosService, recibosService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  ORDEN_PEDIDO_STATUSES,
  INVOICE_TYPE_OPTIONS,
} from '../../utils/constants';
import type { OrdenPedido, OrdenPedidoStatus, Recibo, CreateReciboDTO } from '../../types';

type StatusVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

const STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: 'default',
  CONFIRMED: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  CANCELLED: 'error',
  CONVERTED: 'success',
};

function SkeletonDetail() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
          <div className="h-5 bg-gray-100 dark:bg-slate-700 rounded w-16" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
            {[1, 2, 3, 4].map((i) => (
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

export default function OrdenPedidoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [op, setOp] = useState<OrdenPedido | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [selectedInvoiceType, setSelectedInvoiceType] = useState('FACTURA_B');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [showPayModal, setShowPayModal] = useState(false);
  const [isPayLoading, setIsPayLoading] = useState(false);
  const [cancelReciboId, setCancelReciboId] = useState<string | null>(null);
  const [isCancellingRecibo, setIsCancellingRecibo] = useState(false);

  const loadData = async () => {
    if (!id) return;
    try {
      const [opData, recibosData] = await Promise.all([
        ordenPedidosService.getById(id),
        recibosService.getAll({ ordenPedidoId: id }),
      ]);
      setOp(opData);
      setRecibos(recibosData.data);
    } catch {
      toast.error('Error al cargar orden de pedido');
      navigate('/orden-pedidos');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id, navigate]);

  const handleUpdateStatus = async (status: OrdenPedidoStatus) => {
    if (!id) return;
    setIsUpdating(true);
    setShowStatusMenu(false);
    try {
      const updated = await ordenPedidosService.updateStatus(id, { status: status as 'DRAFT' | 'CONFIRMED' | 'CANCELLED' });
      setOp(updated);
      toast.success('Estado actualizado');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al actualizar estado');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await ordenPedidosService.delete(id);
      toast.success('Orden de pedido eliminada');
      navigate('/orden-pedidos');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al eliminar');
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePay = async (data: CreateReciboDTO) => {
    if (!id) return;
    setIsPayLoading(true);
    try {
      await ordenPedidosService.pay(id, data);
      toast.success('Pago registrado correctamente');
      setShowPayModal(false);
      await loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al registrar pago');
    } finally {
      setIsPayLoading(false);
    }
  };

  const handleCancelRecibo = async () => {
    if (!cancelReciboId) return;
    setIsCancellingRecibo(true);
    try {
      await recibosService.cancel(cancelReciboId);
      toast.success('Recibo cancelado');
      setCancelReciboId(null);
      await loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al cancelar recibo');
    } finally {
      setIsCancellingRecibo(false);
    }
  };

  const handleConvert = async () => {
    if (!id) return;
    setIsConverting(true);
    try {
      const invoice = await ordenPedidosService.convertToInvoice(id, { invoiceType: selectedInvoiceType });
      toast.success(`Factura ${invoice.number} creada en borrador`);
      setShowConvertModal(false);
      navigate(`/invoices/${invoice.id}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al convertir orden de pedido');
    } finally {
      setIsConverting(false);
    }
  };

  if (isLoading || !op) return (
    <div>
      <PageHeader title="Orden de Pedido" backTo="/orden-pedidos" />
      <SkeletonDetail />
    </div>
  );

  const isDraft = op.status === 'DRAFT';
  const canConvert = op.status !== 'CONVERTED' && op.status !== 'CANCELLED';
  const isTerminal = op.status === 'CONVERTED' || op.status === 'CANCELLED';
  const canPay = op.status !== 'CANCELLED' && op.status !== 'CONVERTED' && op.status !== 'PAID' && !!op.customerId;
  const activeRecibos = recibos.filter((r) => r.status === 'EMITTED');
  const paidAmount = activeRecibos.reduce((sum, r) => sum + Number(r.amount), 0);
  const remaining = Math.max(0, Number(op.total) - paidAmount);

  const nextStatuses: Array<{ value: OrdenPedidoStatus; label: string; isPay?: boolean }> = [];
  if (op.status === 'DRAFT') nextStatuses.push({ value: 'CONFIRMED', label: 'Confirmar orden' });
  if (op.status !== 'CANCELLED' && op.status !== 'CONVERTED') {
    nextStatuses.push({ value: 'CANCELLED', label: 'Cancelar orden' });
  }
  if (canPay && remaining > 0) {
    nextStatuses.push({ value: 'PAID', label: 'Registrar pago', isPay: true });
  }

  const canEdit = isDraft;
  const canDelete = isDraft;

  return (
    <div>
      <PageHeader
        title={`Orden de Pedido ${op.number}`}
        backTo="/orden-pedidos"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={() => window.open(`/print/orden-pedido/${op.id}`, '_blank', 'width=420,height=700,scrollbars=yes')}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>

            {canEdit && (
              <Button variant="outline" onClick={() => navigate(`/orden-pedidos/${op.id}/edit`)}>
                <Pencil className="w-4 h-4 mr-2" />
                Editar
              </Button>
            )}

            {nextStatuses.length > 0 && (
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowStatusMenu((v) => !v)}
                  isLoading={isUpdating}
                >
                  Cambiar estado
                  <ChevronDown className="w-3.5 h-3.5 ml-1.5 opacity-60" />
                </Button>
                {showStatusMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowStatusMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-20 min-w-52 py-1 overflow-hidden">
                      {nextStatuses.map((s) => (
                        <button
                          key={s.value}
                          className={`flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm transition-colors duration-100 ${
                            s.isPay
                              ? 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                              : s.value === 'CANCELLED'
                              ? 'text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                              : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                          }`}
                          onClick={() => {
                            if (s.isPay) {
                              setShowStatusMenu(false);
                              setShowPayModal(true);
                            } else {
                              handleUpdateStatus(s.value);
                            }
                          }}
                        >
                          {s.isPay
                            ? <Banknote className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                            : <ArrowRight className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                          }
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {canPay && remaining > 0 && (
              <Button variant="outline" onClick={() => setShowPayModal(true)}>
                <Banknote className="w-4 h-4 mr-2" />
                Registrar pago
              </Button>
            )}

            {canConvert && (
              <Button onClick={() => setShowConvertModal(true)}>
                <FileText className="w-4 h-4 mr-2" />
                Generar factura
              </Button>
            )}

            {canDelete && (
              <Button variant="danger" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar
              </Button>
            )}
          </div>
        }
      />

      {/* Status stepper */}
      {!isTerminal && (
        <div className="flex items-center gap-2 mb-6">
          {(['DRAFT', 'CONFIRMED', 'PAID'] as const).map((step, i, arr) => {
            const labels: Record<string, string> = { DRAFT: 'Borrador', CONFIRMED: 'Confirmada', PAID: 'Pagada' };
            const order = ['DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'PAID'];
            const currentIdx = order.indexOf(op.status);
            const stepOrder = ['DRAFT', 'CONFIRMED', 'PAID'];
            const stepIdx = stepOrder.indexOf(step);
            const currentStepIdx = op.status === 'PARTIALLY_PAID' ? 2 : stepOrder.indexOf(op.status);
            const isDone = stepIdx < currentStepIdx;
            const isCurrent = stepIdx === currentStepIdx;
            return (
              <div key={step} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors duration-200 ${
                  isCurrent ? 'bg-indigo-600 text-white' :
                  isDone ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' :
                  'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
                }`}>
                  {isDone && <CheckCircle className="w-3.5 h-3.5" />}
                  {labels[step]}
                </div>
                {i < arr.length - 1 && (
                  <ArrowRight className={`w-3 h-3 ${stepIdx < currentStepIdx ? 'text-emerald-400 dark:text-emerald-500' : 'text-gray-300 dark:text-slate-600'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Terminal status banners */}
      {op.status === 'CONVERTED' && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm text-emerald-800 dark:text-emerald-300">
          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <span>Esta orden fue convertida a factura.</span>
          {op.invoice && (
            <button
              onClick={() => navigate(`/invoices/${op.invoiceId}`)}
              className="ml-auto flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 transition-colors duration-150"
            >
              Ver factura {op.invoice.number}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      {op.status === 'CANCELLED' && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-800 dark:text-red-300">
          <XCircle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" />
          Orden de pedido cancelada.
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
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Descripción</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Cantidad</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Precio unit.</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">IVA</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {op.items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors duration-100">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{item.description}</p>
                        {item.product && (
                          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{item.product.sku}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-slate-300 text-right tabular-nums">{Number(item.quantity)}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-slate-300 text-right tabular-nums">
                        {formatCurrency(Number(item.unitPrice), op.currency)}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-slate-400 text-right tabular-nums">{Number(item.taxRate)}%</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-white text-right tabular-nums">
                        {formatCurrency(Number(item.total), op.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50/50 dark:bg-slate-700/30 border-t border-gray-200 dark:border-slate-700">
                  <tr>
                    <td colSpan={4} className="px-5 py-3 text-right text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Subtotal</td>
                    <td className="px-5 py-3 text-right text-sm font-medium text-gray-700 dark:text-slate-300 tabular-nums">{formatCurrency(Number(op.subtotal), op.currency)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-5 py-2 text-right text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">IVA</td>
                    <td className="px-5 py-2 text-right text-sm font-medium text-gray-700 dark:text-slate-300 tabular-nums">{formatCurrency(Number(op.taxAmount), op.currency)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-5 py-3 text-right text-sm text-gray-900 dark:text-white font-bold uppercase tracking-wider">Total</td>
                    <td className="px-5 py-3 text-right text-base font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{formatCurrency(Number(op.total), op.currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {op.notes && (
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-5 py-4">
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Notas</p>
              <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">{op.notes}</p>
            </div>
          )}

          {/* Recibos */}
          <RecibosList
            recibos={recibos}
            total={Number(op.total)}
            currency={op.currency}
            canPay={canPay}
            onPay={() => setShowPayModal(true)}
            onCancel={(r) => setCancelReciboId(r.id)}
          />
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
                <Badge variant={STATUS_VARIANT[op.status] ?? 'default'} dot>
                  {ORDEN_PEDIDO_STATUSES[op.status as OrdenPedidoStatus] ?? op.status}
                </Badge>
              </div>
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Fecha</span>
                <span className="text-sm text-gray-900 dark:text-white tabular-nums">{formatDate(op.date)}</span>
              </div>
              {op.dueDate && (
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Fecha de entrega</span>
                  <span className="text-sm text-gray-900 dark:text-white tabular-nums">{formatDate(op.dueDate)}</span>
                </div>
              )}
              {op.paymentTerms && (
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Cond. de venta</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{op.paymentTerms}</span>
                </div>
              )}
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Moneda</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{op.currency}</span>
              </div>
              {op.currency === 'USD' && (
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Tipo de cambio</span>
                  <span className="text-sm text-gray-900 dark:text-white tabular-nums">{Number(op.exchangeRate)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Client */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Cliente</p>
            </div>
            {op.customer ? (
              <div className="px-5 py-4 space-y-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{op.customer.name}</p>
                {op.customer.taxId && (
                  <p className="text-xs text-gray-500 dark:text-slate-400">CUIT: {op.customer.taxId}</p>
                )}
                {op.customer.email && (
                  <p className="text-xs text-gray-500 dark:text-slate-400">{op.customer.email}</p>
                )}
                {op.customer.address && (
                  <p className="text-xs text-gray-400 dark:text-slate-500">{op.customer.address}</p>
                )}
              </div>
            ) : (
              <div className="px-5 py-4">
                <p className="text-sm text-gray-400 dark:text-slate-500 italic">Sin cliente asignado</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Eliminar orden de pedido"
        message="¿Estás seguro de que deseas eliminar esta orden de pedido? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />

      {/* Payment modal */}
      <PaymentModal
        open={showPayModal}
        onClose={() => setShowPayModal(false)}
        onSubmit={handlePay}
        remaining={remaining}
        currency={op.currency}
        isLoading={isPayLoading}
      />

      <ConfirmDialog
        isOpen={!!cancelReciboId}
        onClose={() => setCancelReciboId(null)}
        onConfirm={handleCancelRecibo}
        title="Cancelar recibo"
        message="¿Estás seguro de que deseas cancelar este recibo? Se revertirá el movimiento de cuenta corriente y el estado de la orden se actualizará."
        confirmText="Cancelar recibo"
        isLoading={isCancellingRecibo}
      />

      {/* Convert to invoice modal */}
      <Modal
        isOpen={showConvertModal}
        onClose={() => setShowConvertModal(false)}
        title="Generar factura desde orden de pedido"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Se creará una factura en borrador con los ítems de esta orden de pedido.
            La orden quedará marcada como convertida.
          </p>

          {!op.customerId && (
            <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3.5">
              <XCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Esta orden no tiene cliente asignado. Editá la orden y asigná un cliente antes de convertirla.
              </p>
            </div>
          )}

          {op.customerId && op.items.some((i) => !i.productId) && (
            <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3.5">
              <XCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Algunos ítems no tienen producto asignado. Editá la orden y asigná productos a todos los ítems.
              </p>
            </div>
          )}

          {op.customerId && op.items.every((i) => i.productId) && (
            <Select
              label="Tipo de factura a generar"
              options={INVOICE_TYPE_OPTIONS}
              value={selectedInvoiceType}
              onChange={setSelectedInvoiceType}
            />
          )}

          <div className="flex justify-end gap-2.5 pt-1">
            <Button variant="outline" onClick={() => setShowConvertModal(false)} disabled={isConverting}>
              Cancelar
            </Button>
            <Button
              onClick={handleConvert}
              isLoading={isConverting}
              disabled={!op.customerId || op.items.some((i) => !i.productId)}
            >
              <FileText className="w-4 h-4 mr-2" />
              Generar factura
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
