import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Pencil, Send, CheckCircle, XCircle, FileText, Trash2, ArrowRight, ChevronDown, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, Modal, Select } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { budgetsService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  BUDGET_STATUSES,
  INVOICE_TYPE_OPTIONS,
  INVOICE_TYPES,
} from '../../utils/constants';

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
import type { Budget } from '../../types';

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
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="h-5 bg-gray-100 rounded w-16" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-lg" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 bg-gray-100 rounded w-20" />
                <div className="h-4 bg-gray-100 rounded w-24" />
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
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [selectedInvoiceType, setSelectedInvoiceType] = useState('');
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  useEffect(() => {
    const fetchBudget = async () => {
      if (!id) return;
      try {
        const data = await budgetsService.getById(id);
        setBudget(data);
        setSelectedInvoiceType(data.type);
      } catch {
        toast.error('Error al cargar presupuesto');
        navigate('/budgets');
      } finally {
        setIsLoading(false);
      }
    };
    fetchBudget();
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

  const handleConvert = async () => {
    if (!id) return;
    setIsConverting(true);
    try {
      const invoice = await budgetsService.convertToInvoice(id, { invoiceType: selectedInvoiceType });
      toast.success(`Factura ${invoice.number} creada en borrador`);
      setShowConvertModal(false);
      navigate(`/invoices/${invoice.id}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al convertir presupuesto');
    } finally {
      setIsConverting(false);
    }
  };

  if (isLoading || !budget) return (
    <div>
      <PageHeader title="Presupuesto" backTo="/budgets" />
      <SkeletonDetail />
    </div>
  );

  const isDraft = budget.status === 'DRAFT';
  const canConvert = budget.status === 'DRAFT' || budget.status === 'SENT' || budget.status === 'ACCEPTED';
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
  const isFullyDelivered = budget.deliveryStatus === 'DELIVERED';

  return (
    <div>
      <PageHeader
        title={`Presupuesto ${budget.number}`}
        subtitle={INVOICE_TYPES[budget.type]}
        backTo="/budgets"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
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
                    <div className="absolute right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg z-20 min-w-52 py-1 overflow-hidden">
                      {nextStatuses.map((s) => (
                        <button
                          key={s.value}
                          className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-100"
                          onClick={() => handleUpdateStatus(s.value)}
                        >
                          <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {canConvert && (
              <Button onClick={() => setShowConvertModal(true)}>
                <FileText className="w-4 h-4 mr-2" />
                Generar factura
              </Button>
            )}

            {hasDeliverableItems && !isFullyDelivered && (
              <Button
                variant="outline"
                onClick={() => navigate(`/remitos/new?budgetId=${budget.id}`)}
              >
                <ClipboardList className="w-4 h-4 mr-2" />
                Generar remito
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
                  isDone ? 'bg-emerald-100 text-emerald-700' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {isDone && <CheckCircle className="w-3.5 h-3.5" />}
                  {labels[step]}
                </div>
                {i < arr.length - 1 && (
                  <ArrowRight className={`w-3 h-3 ${stepIdx < currentIdx ? 'text-emerald-400' : 'text-gray-300'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Terminal status banners */}
      {budget.status === 'CONVERTED' && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
          <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>Este presupuesto fue convertido a factura.</span>
          {budget.invoice && (
            <button
              onClick={() => navigate(`/invoices/${budget.invoiceId}`)}
              className="ml-auto flex items-center gap-1.5 font-semibold text-emerald-700 hover:text-emerald-900 transition-colors duration-150"
            >
              Ver factura {budget.invoice.number}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      {budget.status === 'REJECTED' && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          Presupuesto rechazado.
        </div>
      )}
      {budget.status === 'EXPIRED' && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <XCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          Presupuesto vencido.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">

        {/* ── Left: items table + notes ── */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Ítems</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Descripción</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Cantidad</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Precio unit.</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">IVA</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {budget.items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/60 transition-colors duration-100">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-gray-900">{item.description}</p>
                        {item.product && (
                          <p className="text-xs text-gray-400 mt-0.5">{item.product.sku}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-700 text-right tabular-nums">{Number(item.quantity)}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-700 text-right tabular-nums">
                        {formatCurrency(Number(item.unitPrice), budget.currency)}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500 text-right tabular-nums">{Number(item.taxRate)}%</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 text-right tabular-nums">
                        {formatCurrency(Number(item.total), budget.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50/50 border-t border-gray-200">
                  <tr>
                    <td colSpan={4} className="px-5 py-3 text-right text-xs text-gray-500 uppercase tracking-wider font-semibold">Subtotal</td>
                    <td className="px-5 py-3 text-right text-sm font-medium text-gray-700 tabular-nums">{formatCurrency(Number(budget.subtotal), budget.currency)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-5 py-2 text-right text-xs text-gray-500 uppercase tracking-wider font-semibold">IVA</td>
                    <td className="px-5 py-2 text-right text-sm font-medium text-gray-700 tabular-nums">{formatCurrency(Number(budget.taxAmount), budget.currency)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-5 py-3 text-right text-sm text-gray-900 font-bold uppercase tracking-wider">Total</td>
                    <td className="px-5 py-3 text-right text-base font-bold text-indigo-600 tabular-nums">{formatCurrency(Number(budget.total), budget.currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {budget.notes && (
            <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Notas</p>
              <p className="text-sm text-gray-600 leading-relaxed">{budget.notes}</p>
            </div>
          )}
        </div>

        {/* ── Right: info sidebar ── */}
        <div className="space-y-4">
          {/* Main info */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Información</p>
            </div>
            <div className="divide-y divide-gray-100">
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500">Tipo</span>
                <span className="text-sm font-medium text-gray-900">{INVOICE_TYPES[budget.type]}</span>
              </div>
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500">Estado</span>
                <Badge variant={STATUS_VARIANT[budget.status] ?? 'default'} dot>
                  {BUDGET_STATUSES[budget.status]}
                </Badge>
              </div>
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500">Fecha</span>
                <span className="text-sm text-gray-900 tabular-nums">{formatDate(budget.date)}</span>
              </div>
              {budget.validUntil && (
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-500">Válido hasta</span>
                  <span className="text-sm text-gray-900 tabular-nums">{formatDate(budget.validUntil)}</span>
                </div>
              )}
              {budget.deliveryStatus && hasDeliverableItems && (
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-500">Entrega</span>
                  <Badge variant={DELIVERY_STATUS_VARIANT[budget.deliveryStatus] ?? 'default'} dot>
                    {DELIVERY_STATUS_LABEL[budget.deliveryStatus]}
                  </Badge>
                </div>
              )}
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500">Moneda</span>
                <span className="text-sm font-medium text-gray-900">{budget.currency}</span>
              </div>
              {budget.currency === 'USD' && (
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-500">Tipo de cambio</span>
                  <span className="text-sm text-gray-900 tabular-nums">{Number(budget.exchangeRate)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Client */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cliente</p>
            </div>
            {budget.customer ? (
              <div className="px-5 py-4 space-y-1">
                <p className="text-sm font-semibold text-gray-900">{budget.customer.name}</p>
                {budget.customer.taxId && (
                  <p className="text-xs text-gray-500">CUIT: {budget.customer.taxId}</p>
                )}
                {budget.customer.email && (
                  <p className="text-xs text-gray-500">{budget.customer.email}</p>
                )}
                {budget.customer.address && (
                  <p className="text-xs text-gray-400">{budget.customer.address}</p>
                )}
              </div>
            ) : (
              <div className="px-5 py-4">
                <p className="text-sm text-gray-400 italic">Consumidor final</p>
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

      {/* Convert to invoice modal */}
      <Modal
        isOpen={showConvertModal}
        onClose={() => setShowConvertModal(false)}
        title="Generar factura desde presupuesto"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Se creará una factura en borrador con los ítems de este presupuesto.
            El presupuesto quedará marcado como convertido.
          </p>

          {!budget.customerId && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg p-3.5">
              <XCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Este presupuesto no tiene cliente asignado. Editá el presupuesto y asigná un cliente antes de convertirlo.
              </p>
            </div>
          )}

          {budget.customerId && budget.items.some((i) => !i.productId) && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg p-3.5">
              <XCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Algunos ítems no tienen producto asignado. Editá el presupuesto y asigná productos a todos los ítems.
              </p>
            </div>
          )}

          {budget.customerId && budget.items.every((i) => i.productId) && (
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
              disabled={!budget.customerId || budget.items.some((i) => !i.productId)}
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
