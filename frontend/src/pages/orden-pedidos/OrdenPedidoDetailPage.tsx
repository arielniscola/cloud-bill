import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Pencil, CheckCircle, XCircle, FileText, Trash2, ArrowRight, ChevronDown, Banknote, Printer, Truck, Copy, Mail, PackageCheck, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, Modal, Select } from '../../components/ui';
import { PageHeader, ConfirmDialog, PaymentModal, RecibosList, SendEmailModal, DocumentTimeline, RelatedDocuments } from '../../components/shared';
import type { TimelineEvent, RelatedDocGroup } from '../../components/shared';
import MercadoPagoPayModal from '../../components/shared/MercadoPagoPayModal';
import { ordenPedidosService, recibosService, remitosService, appSettingsService, budgetsService } from '../../services';
import { formatCurrency, formatDate, formatCuit } from '../../utils/formatters';
import {
  ORDEN_PEDIDO_STATUSES,
  INVOICE_TYPE_OPTIONS,
  INVOICE_STATUSES,
  REMITO_STATUSES,
} from '../../utils/constants';
import type { OrdenPedido, OrdenPedidoStatus, Recibo, CreateReciboDTO, Remito, Budget } from '../../types';

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
  const [remitos, setRemitos] = useState<Remito[]>([]);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showMpModal, setShowMpModal] = useState(false);
  const [isPayLoading, setIsPayLoading] = useState(false);
  const [cancelReciboId, setCancelReciboId] = useState<string | null>(null);
  const [isCancellingRecibo, setIsCancellingRecibo] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [deliveringRemitoId, setDeliveringRemitoId] = useState<string | null>(null);
  const [printFormat, setPrintFormat] = useState<'A4' | 'THERMAL_80MM'>('THERMAL_80MM');
  const [sourceBudget, setSourceBudget] = useState<Budget | null>(null);

  const loadData = async () => {
    if (!id) return;
    try {
      const [opData, recibosData, remitosData] = await Promise.all([
        ordenPedidosService.getById(id),
        recibosService.getAll({ ordenPedidoId: id }),
        remitosService.getAll({ ordenPedidoId: id, limit: 100 }),
      ]);
      setOp(opData);
      setRecibos(recibosData.data);
      setRemitos(remitosData.data);
      if (opData.budgetId) {
        budgetsService.getById(opData.budgetId).then(setSourceBudget).catch(() => setSourceBudget(null));
      } else {
        setSourceBudget(null);
      }
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

  useEffect(() => {
    appSettingsService.get()
      .then((s) => {
        const fmt = (s.printFormatOrdenPedido ?? s.printFormat ?? 'THERMAL_80MM') as 'A4' | 'THERMAL_80MM';
        setPrintFormat(fmt);
      })
      .catch(() => {});
  }, []);

  const handlePrint = () => {
    if (!op) return;
    if (printFormat === 'A4') {
      toast('Plantilla A4 para Órdenes de Pedido aún no implementada — usando 80mm', { icon: 'ℹ️' });
    }
    window.open(`/print/orden-pedido/${op.id}`, '_blank', 'width=420,height=700,scrollbars=yes');
  };

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

  const handleDeliverRemito = async (remito: Remito) => {
    setDeliveringRemitoId(remito.id);
    try {
      const pendingItems = (remito.items ?? [])
        .filter((item) => Number(item.quantity) - Number(item.deliveredQuantity) > 0)
        .map((item) => ({
          remitoItemId: item.id,
          quantity: Number(item.quantity) - Number(item.deliveredQuantity),
        }));
      if (pendingItems.length === 0) {
        toast.error('No hay items pendientes de entrega');
        return;
      }
      await remitosService.deliver(remito.id, { items: pendingItems });
      toast.success('Remito marcado como entregado');
      await loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al marcar como entregado');
    } finally {
      setDeliveringRemitoId(null);
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
  const canPay = (op.status === 'CONFIRMED' || op.status === 'PARTIALLY_PAID') && !!op.customerId;
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

  // ── Timeline: creada → confirmada → cobros → convertida/saldo ──
  const timelineEvents: TimelineEvent[] = (() => {
    const dated: TimelineEvent[] = [{ date: op.createdAt, title: 'Creada' }];
    for (const r of activeRecibos) {
      dated.push({
        date: r.date,
        title: `Cobro ${r.number}`,
        detail: formatCurrency(Number(r.amount), op.currency),
        tone: 'success',
      });
    }
    dated.sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime());
    if (op.status === 'CANCELLED') {
      dated.push({ title: 'Cancelada', tone: 'danger' });
    } else if (op.status === 'CONVERTED') {
      dated.push({ title: op.invoice ? `Convertida a factura ${op.invoice.number}` : 'Convertida a factura', tone: 'success' });
    } else if (op.status === 'PAID') {
      dated.push({ title: 'Cobrada por completo', tone: 'success' });
    } else if (remaining > 0.009 && op.status !== 'DRAFT') {
      dated.push({ title: `Saldo pendiente: ${formatCurrency(remaining, op.currency)}`, tone: 'pending' });
    }
    return dated;
  })();

  // ── Documentos relacionados: presupuesto de origen, factura generada, remitos, recibos ──
  const relatedGroups: RelatedDocGroup[] = [
    {
      title: 'Origen',
      docs: sourceBudget
        ? [{ label: `Presupuesto ${sourceBudget.number}`, to: `/budgets/${sourceBudget.id}`, detail: formatDate(sourceBudget.date) }]
        : [],
    },
    {
      title: 'Factura',
      docs: op.invoice
        ? [{ label: `Factura ${op.invoice.number}`, to: `/invoices/${op.invoice.id}`, badge: INVOICE_STATUSES[op.invoice.status as keyof typeof INVOICE_STATUSES] ?? op.invoice.status }]
        : [],
    },
    {
      title: 'Remitos',
      docs: remitos.map((r) => ({
        label: r.number,
        to: `/remitos/${r.id}`,
        badge: REMITO_STATUSES[r.status] ?? r.status,
        detail: formatDate(r.date),
      })),
    },
    {
      title: 'Recibos',
      docs: activeRecibos.map((r) => ({
        label: r.number,
        to: `/recibos/${r.id}`,
        detail: formatCurrency(Number(r.amount), op.currency),
      })),
    },
  ];

  return (
    <div>
      <PageHeader
        title={`Orden de Pedido ${op.number}`}
        backTo="/orden-pedidos"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir ({printFormat === 'THERMAL_80MM' ? '80mm' : 'A4'})
            </Button>

            <Button variant="outline" onClick={() => setShowEmailModal(true)}>
              <Mail className="w-4 h-4 mr-2" />
              Enviar
            </Button>

            <Button
              variant="outline"
              onClick={() => navigate('/orden-pedidos/new', { state: { fromOrdenPedido: op } })}
            >
              <Copy className="w-4 h-4 mr-2" />
              Nuevo pedido
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

            {canPay && remaining > 0 && (
              <Button variant="outline" onClick={() => setShowMpModal(true)}>
                <Smartphone className="w-4 h-4 mr-2" />
                Cobrar con MP
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
                    {op.items.some((i) => Number(i.discountPct) > 0) && (
                      <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Desc.%</th>
                    )}
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">IVA</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {op.items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors duration-100">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{item.description}</p>
                        {item.variant && (
                          <p className="text-[11px] text-violet-600 dark:text-violet-400 font-medium mt-0.5">{item.variant.name}</p>
                        )}
                        {(item.variant?.sku ?? item.product?.sku) && (
                          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{item.variant?.sku ?? item.product?.sku}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-slate-300 text-right tabular-nums">{Number(item.quantity)}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-slate-300 text-right tabular-nums">
                        {formatCurrency(Number(item.unitPrice), op.currency)}
                      </td>
                      {op.items.some((i) => Number(i.discountPct) > 0) && (
                        <td className="px-5 py-3.5 text-sm text-right tabular-nums">
                          {Number(item.discountPct) > 0
                            ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">{Number(item.discountPct)}%</span>
                            : <span className="text-gray-300 dark:text-slate-600">—</span>
                          }
                        </td>
                      )}
                      <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-slate-400 text-right tabular-nums">{Number(item.taxRate)}%</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-white text-right tabular-nums">
                        {formatCurrency(Number(item.total), op.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50/50 dark:bg-slate-700/30 border-t border-gray-200 dark:border-slate-700">
                  <tr>
                    <td colSpan={op.items.some((i) => Number(i.discountPct) > 0) ? 5 : 4} className="px-5 py-3 text-right text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Subtotal</td>
                    <td className="px-5 py-3 text-right text-sm font-medium text-gray-700 dark:text-slate-300 tabular-nums">{formatCurrency(Number(op.subtotal), op.currency)}</td>
                  </tr>
                  <tr>
                    <td colSpan={op.items.some((i) => Number(i.discountPct) > 0) ? 5 : 4} className="px-5 py-2 text-right text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">IVA</td>
                    <td className="px-5 py-2 text-right text-sm font-medium text-gray-700 dark:text-slate-300 tabular-nums">{formatCurrency(Number(op.taxAmount), op.currency)}</td>
                  </tr>
                  <tr>
                    <td colSpan={op.items.some((i) => Number(i.discountPct) > 0) ? 5 : 4} className="px-5 py-3 text-right text-sm text-gray-900 dark:text-white font-bold uppercase tracking-wider">Total</td>
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

          {/* Remitos / Entregas */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
              <Truck className="w-4 h-4 text-gray-400 dark:text-slate-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Remitos / Entregas</h3>
            </div>
            {remitos.length === 0 ? (
              <div className="px-5 py-6 text-sm text-gray-400 dark:text-slate-500 text-center">
                Sin remitos asociados
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50/80 dark:bg-slate-700/50">
                    <tr>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">N°</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Fecha</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Ítems</th>
                      <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {remitos.map((remito) => {
                      const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'info' | 'error'> = {
                        PENDING: 'warning',
                        PARTIALLY_DELIVERED: 'info',
                        DELIVERED: 'success',
                        CANCELLED: 'error',
                      };
                      const canDeliver = remito.status === 'PENDING' || remito.status === 'PARTIALLY_DELIVERED';
                      return (
                        <tr
                          key={remito.id}
                          onClick={() => navigate(`/remitos/${remito.id}`)}
                          className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 cursor-pointer transition-colors duration-100"
                        >
                          <td className="px-5 py-3 text-sm font-mono font-medium text-indigo-600 dark:text-indigo-400">
                            {remito.number}
                          </td>
                          <td className="px-5 py-3 text-sm text-gray-600 dark:text-slate-400 tabular-nums">
                            {formatDate(remito.date)}
                          </td>
                          <td className="px-5 py-3 text-sm text-gray-600 dark:text-slate-400">
                            {remito.items?.length ?? '—'}{remito.items?.length != null ? ` ítem${remito.items.length !== 1 ? 's' : ''}` : ''}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <Badge variant={statusVariant[remito.status] ?? 'default'} dot>
                              {REMITO_STATUSES[remito.status as keyof typeof REMITO_STATUSES] ?? remito.status}
                            </Badge>
                          </td>
                          <td className="px-5 py-3 text-right">
                            {canDeliver && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeliverRemito(remito); }}
                                disabled={deliveringRemitoId === remito.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                                  text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20
                                  border border-emerald-200 dark:border-emerald-800
                                  hover:bg-emerald-100 dark:hover:bg-emerald-900/40
                                  disabled:opacity-50 transition-colors duration-150"
                              >
                                <PackageCheck className="w-3.5 h-3.5" />
                                {deliveringRemitoId === remito.id ? 'Entregando...' : 'Entregar todo'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

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
                  <p className="text-xs text-gray-500 dark:text-slate-400">CUIT: {formatCuit(op.customer.taxId)}</p>
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

          {/* Documentos relacionados */}
          <RelatedDocuments groups={relatedGroups} />

          {/* Historia del documento */}
          <DocumentTimeline events={timelineEvents} />
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
        total={Number(op.total)}
        paidCount={activeRecibos.length}
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

      <MercadoPagoPayModal
        open={showMpModal}
        onClose={() => setShowMpModal(false)}
        onPaymentRegistered={loadData}
        ordenPedidoId={op.id}
        title={`Cobrar Orden de Pedido ${op.number} con MP`}
      />

      <SendEmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        documentLabel={`Orden de Pedido ${op.number}`}
        defaultEmail={op.customer?.email ?? ''}
        onSend={async (to) => {
          await ordenPedidosService.sendEmail(op.id, to);
          toast.success('Email enviado correctamente');
        }}
      />
    </div>
  );
}
