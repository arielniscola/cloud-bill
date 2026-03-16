import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Pencil, Send, CheckCircle, XCircle, ShoppingBag, Trash2, ArrowRight, ChevronDown, FileDown, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { pdf } from '@react-pdf/renderer';
import { Badge, Button } from '../../components/ui';
import { PageHeader, ConfirmDialog, SendEmailModal } from '../../components/shared';
import { budgetsService, afipService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { BUDGET_STATUSES, INVOICE_TYPES } from '../../utils/constants';
import type { Budget } from '../../types';
import BudgetPDF from '../../components/pdf/BudgetPDF';

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  NOT_DELIVERED: 'Sin entregas',
  PARTIALLY_DELIVERED: 'Entrega parcial',
  DELIVERED: 'Entregado',
};
type DeliveryVariant = 'default' | 'success' | 'warning';
const DELIVERY_STATUS_VARIANT: Record<string, DeliveryVariant> = {
  NOT_DELIVERED: 'default',
  PARTIALLY_DELIVERED: 'warning',
  DELIVERED: 'success',
};

type StatusVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

const STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: 'default',
  SENT: 'info',
  ACCEPTED: 'success',
  REJECTED: 'error',
  CONVERTED: 'success',
  EXPIRED: 'warning',
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

export default function BudgetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const handleDownloadPDF = async () => {
    if (!budget) return;
    setIsGeneratingPDF(true);
    try {
      const afipConfig = await afipService.getConfig();
      const blob = await pdf(<BudgetPDF budget={budget} afipConfig={afipConfig} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `presupuesto-${budget.number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast.error(err.message || 'Error al generar PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const loadData = async () => {
    if (!id) return;
    try {
      const budgetData = await budgetsService.getById(id);
      setBudget(budgetData);
    } catch {
      toast.error('Error al cargar presupuesto');
      navigate('/budgets');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id, navigate]);

  const handleUpdateStatus = async (status: Budget['status']) => {
    if (!id) return;
    setIsUpdating(true);
    setShowStatusMenu(false);
    try {
      const updated = await budgetsService.updateStatus(id, { status });
      setBudget(updated);
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
      await budgetsService.delete(id);
      toast.success('Presupuesto eliminado');
      navigate('/budgets');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al eliminar');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading || !budget) return (
    <div>
      <PageHeader title="Presupuesto" backTo="/budgets" />
      <SkeletonDetail />
    </div>
  );

  const isDraft = budget.status === 'DRAFT';
  const canGenerateOP = budget.status === 'DRAFT' || budget.status === 'SENT' || budget.status === 'ACCEPTED';
  const isTerminal = budget.status === 'CONVERTED' || budget.status === 'REJECTED' || budget.status === 'EXPIRED';

  const nextStatuses: Array<{ value: Budget['status']; label: string }> = [];
  if (budget.status === 'DRAFT') nextStatuses.push({ value: 'SENT', label: 'Marcar como enviado' });
  if (budget.status === 'SENT') {
    nextStatuses.push({ value: 'ACCEPTED', label: 'Marcar como aceptado' });
    nextStatuses.push({ value: 'REJECTED', label: 'Marcar como rechazado' });
  }
  if (budget.status === 'DRAFT' || budget.status === 'SENT') {
    nextStatuses.push({ value: 'EXPIRED', label: 'Marcar como vencido' });
  }

  const canEdit = isDraft;
  const canDelete = isDraft;
  const hasDeliverableItems = budget.items.some((i) => i.productId);

  return (
    <div>
      <PageHeader
        title={`Presupuesto ${budget.number}`}
        subtitle={INVOICE_TYPES[budget.type]}
        backTo="/budgets"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={handleDownloadPDF} isLoading={isGeneratingPDF}>
              <FileDown className="w-4 h-4 mr-2" />
              PDF
            </Button>
            <Button variant="outline" onClick={() => setShowEmailModal(true)}>
              <Mail className="w-4 h-4 mr-2" />
              Enviar
            </Button>

            {canEdit && (
              <Button variant="outline" onClick={() => navigate(`/budgets/${budget.id}/edit`)}>
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
                  <Send className="w-4 h-4 mr-2" />
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
                          className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors duration-100"
                          onClick={() => handleUpdateStatus(s.value)}
                        >
                          <ArrowRight className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {canGenerateOP && (
              <Button onClick={() => navigate('/orden-pedidos/new', { state: { fromBudget: budget } })}>
                <ShoppingBag className="w-4 h-4 mr-2" />
                Generar orden de pedido
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

      {/* Status strip */}
      {!isTerminal && (
        <div className="flex items-center gap-2 mb-6">
          {(['DRAFT', 'SENT', 'ACCEPTED'] as const).map((step, i, arr) => {
            const labels: Record<string, string> = { DRAFT: 'Borrador', SENT: 'Enviado', ACCEPTED: 'Aceptado' };
            const order = ['DRAFT', 'SENT', 'ACCEPTED'];
            const currentIdx = order.indexOf(budget.status);
            const stepIdx = order.indexOf(step);
            const isDone = stepIdx < currentIdx;
            const isCurrent = stepIdx === currentIdx;
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
                  <ArrowRight className={`w-3 h-3 ${stepIdx < currentIdx ? 'text-emerald-400 dark:text-emerald-500' : 'text-gray-300 dark:text-slate-600'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Terminal status banners */}
      {budget.status === 'CONVERTED' && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm text-emerald-800 dark:text-emerald-300">
          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <span>Este presupuesto fue convertido en una orden de pedido.</span>
        </div>
      )}
      {budget.status === 'REJECTED' && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-800 dark:text-red-300">
          <XCircle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" />
          Presupuesto rechazado.
        </div>
      )}
      {budget.status === 'EXPIRED' && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-800 dark:text-amber-300">
          <XCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0" />
          Presupuesto vencido.
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
                  {budget.items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors duration-100">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{item.description}</p>
                        {item.product && (
                          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{item.product.sku}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-slate-300 text-right tabular-nums">{Number(item.quantity)}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-slate-300 text-right tabular-nums">
                        {formatCurrency(Number(item.unitPrice), budget.currency)}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-slate-400 text-right tabular-nums">{Number(item.taxRate)}%</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-white text-right tabular-nums">
                        {formatCurrency(Number(item.total), budget.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50/50 dark:bg-slate-700/30 border-t border-gray-200 dark:border-slate-700">
                  <tr>
                    <td colSpan={4} className="px-5 py-3 text-right text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Subtotal</td>
                    <td className="px-5 py-3 text-right text-sm font-medium text-gray-700 dark:text-slate-300 tabular-nums">{formatCurrency(Number(budget.subtotal), budget.currency)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-5 py-2 text-right text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">IVA</td>
                    <td className="px-5 py-2 text-right text-sm font-medium text-gray-700 dark:text-slate-300 tabular-nums">{formatCurrency(Number(budget.taxAmount), budget.currency)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-5 py-3 text-right text-sm text-gray-900 dark:text-white font-bold uppercase tracking-wider">Total</td>
                    <td className="px-5 py-3 text-right text-base font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{formatCurrency(Number(budget.total), budget.currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {budget.notes && (
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-5 py-4">
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Notas</p>
              <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">{budget.notes}</p>
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
                <span className="text-sm text-gray-500 dark:text-slate-400">Tipo</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{INVOICE_TYPES[budget.type]}</span>
              </div>
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Estado</span>
                <Badge variant={STATUS_VARIANT[budget.status] ?? 'default'} dot>
                  {BUDGET_STATUSES[budget.status]}
                </Badge>
              </div>
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Fecha</span>
                <span className="text-sm text-gray-900 dark:text-white tabular-nums">{formatDate(budget.date)}</span>
              </div>
              {budget.validUntil && (
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Válido hasta</span>
                  <span className="text-sm text-gray-900 dark:text-white tabular-nums">{formatDate(budget.validUntil)}</span>
                </div>
              )}
              {budget.paymentTerms && (
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Cond. de venta</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{budget.paymentTerms}</span>
                </div>
              )}
              {budget.deliveryStatus && hasDeliverableItems && (
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Entrega</span>
                  <Badge variant={DELIVERY_STATUS_VARIANT[budget.deliveryStatus] ?? 'default'} dot>
                    {DELIVERY_STATUS_LABEL[budget.deliveryStatus]}
                  </Badge>
                </div>
              )}
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Moneda</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{budget.currency}</span>
              </div>
              {budget.currency === 'USD' && (
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Tipo de cambio</span>
                  <span className="text-sm text-gray-900 dark:text-white tabular-nums">{Number(budget.exchangeRate)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Client */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Cliente</p>
            </div>
            {budget.customer ? (
              <div className="px-5 py-4 space-y-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{budget.customer.name}</p>
                {budget.customer.taxId && (
                  <p className="text-xs text-gray-500 dark:text-slate-400">CUIT: {budget.customer.taxId}</p>
                )}
                {budget.customer.email && (
                  <p className="text-xs text-gray-500 dark:text-slate-400">{budget.customer.email}</p>
                )}
                {budget.customer.address && (
                  <p className="text-xs text-gray-400 dark:text-slate-500">{budget.customer.address}</p>
                )}
              </div>
            ) : (
              <div className="px-5 py-4">
                <p className="text-sm text-gray-400 dark:text-slate-500 italic">Consumidor final</p>
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
        title="Eliminar presupuesto"
        message="¿Estás seguro de que deseas eliminar este presupuesto? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />

      <SendEmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        defaultEmail={(budget as any)?.customer?.email ?? ''}
        documentLabel={budget ? `Presupuesto ${budget.number}` : ''}
        onSend={async (to) => {
          await budgetsService.sendEmail(budget!.id, to);
          toast.success('Correo enviado correctamente');
        }}
      />

    </div>
  );
}
