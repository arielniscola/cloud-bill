import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  XCircle, CheckCircle, Pencil, Send, Banknote, Zap, FileDown, ArrowRight, ClipboardList, RotateCcw, Printer, Mail,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { pdf } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { Badge, Button } from '../../components/ui';
import { PageHeader, ConfirmDialog, PaymentModal, RecibosList, SendEmailModal } from '../../components/shared';
import { invoicesService, recibosService, afipService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { INVOICE_TYPES, INVOICE_STATUSES } from '../../utils/constants';
import type { Invoice, Recibo, CreateReciboDTO } from '../../types';
import InvoicePDF from '../../components/pdf/InvoicePDF';

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
  ISSUED: 'info',
  PAID: 'success',
  CANCELLED: 'error',
  PARTIALLY_PAID: 'warning',
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

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [isPayLoading, setIsPayLoading] = useState(false);
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEmitting, setIsEmitting] = useState(false);
  const [showEmitDialog, setShowEmitDialog] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [cancelReciboId, setCancelReciboId] = useState<string | null>(null);
  const [isCancellingRecibo, setIsCancellingRecibo] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const loadData = async () => {
    if (!id) return;
    try {
      const [invoiceData, recibosData] = await Promise.all([
        invoicesService.getById(id),
        recibosService.getAll({ invoiceId: id }),
      ]);
      setInvoice(invoiceData);
      setRecibos(recibosData.data);
    } catch {
      toast.error('Error al cargar factura');
      navigate('/invoices');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id, navigate]);

  const handleCancel = async () => {
    if (!id) return;
    setIsCanceling(true);
    try {
      await invoicesService.cancel(id);
      toast.success('Factura cancelada');
      setShowCancelDialog(false);
      await loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al cancelar factura');
    } finally {
      setIsCanceling(false);
    }
  };

  const handlePay = async (data: CreateReciboDTO) => {
    if (!id) return;
    setIsPayLoading(true);
    try {
      await invoicesService.pay(id, data);
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

  const handleIssue = async () => {
    if (!id) return;
    setIsUpdating(true);
    try {
      await invoicesService.updateStatus(id, { status: 'ISSUED' });
      toast.success('Factura emitida');
      setShowIssueDialog(false);
      await loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al emitir factura');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEmitArca = async () => {
    if (!id) return;
    setIsEmitting(true);
    try {
      const updated = await afipService.emitInvoice(id);
      toast.success(`Factura emitida ante ARCA. CAE: ${updated.cae}`);
      setShowEmitDialog(false);
      await loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al emitir ante ARCA');
    } finally {
      setIsEmitting(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!invoice) return;
    setIsGeneratingPDF(true);
    try {
      const afipConfig = await afipService.getConfig();
      let qrCodeDataUrl: string | undefined;
      if (invoice.cae && afipConfig) {
        const TYPE_CODES: Record<string, number> = {
          FACTURA_A: 1, FACTURA_B: 6, FACTURA_C: 11,
          NOTA_DEBITO_A: 2, NOTA_DEBITO_B: 7, NOTA_DEBITO_C: 12,
          NOTA_CREDITO_A: 3, NOTA_CREDITO_B: 8, NOTA_CREDITO_C: 13,
        };
        const qrPayload = {
          ver: 1,
          fecha: invoice.date.slice(0, 10),
          cuit: afipConfig.cuit.replace(/\D/g, ''),
          ptoVta: invoice.afipPtVenta ?? afipConfig.salePoint,
          tipoCmp: TYPE_CODES[invoice.type] ?? 6,
          nroCmp: invoice.afipCbtNum ?? 0,
          importe: invoice.total,
          moneda: invoice.currency === 'USD' ? 'DOL' : 'PES',
          ctz: invoice.currency === 'USD' ? (invoice.exchangeRate ?? 1) : 1,
          tipoDocRec: invoice.customer?.taxId ? 80 : 99,
          nroDocRec: invoice.customer?.taxId?.replace(/\D/g, '') ?? '0',
          tipoCodAut: 'E',
          codAut: invoice.cae,
        };
        const encoded = btoa(JSON.stringify(qrPayload));
        const qrUrl = `https://www.afip.gob.ar/fe/qr/?p=${encoded}`;
        qrCodeDataUrl = await QRCode.toDataURL(qrUrl, { width: 150, margin: 1 });
      }
      const blob = await pdf(
        <InvoicePDF invoice={invoice} afipConfig={afipConfig} qrCodeDataUrl={qrCodeDataUrl} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `factura-${invoice.number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast.error(err.message || 'Error al generar PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  if (isLoading || !invoice) return (
    <div>
      <PageHeader title="Factura" backTo="/invoices" />
      <SkeletonDetail />
    </div>
  );

  const isDraft = invoice.status === 'DRAFT';
  const canCancel = invoice.status !== 'CANCELLED' && invoice.status !== 'PAID';
  const canMarkAsPaid = invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && invoice.status !== 'DRAFT';
  const isFactura = ['FACTURA_A', 'FACTURA_B', 'FACTURA_C'].includes(invoice.type);
  const isNcNdStatus = ['ISSUED', 'PAID', 'PARTIALLY_PAID'].includes(invoice.status);
  const canGenerateNC = isFactura && isNcNdStatus;
  const canGenerateND = isFactura && isNcNdStatus;
  const canEmitArca = (isDraft || invoice.status === 'ISSUED') && !invoice.cae;
  const activeRecibos = recibos.filter((r) => r.status === 'EMITTED');
  const paidAmount = activeRecibos.reduce((sum, r) => sum + Number(r.amount), 0);
  const remaining = Math.max(0, Number(invoice.total) - paidAmount);
  const isCancelled = invoice.status === 'CANCELLED';

  return (
    <div>
      <PageHeader
        title={`Factura ${invoice.number}`}
        subtitle={INVOICE_TYPES[invoice.type]}
        backTo="/invoices"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {isDraft && (
              <Button variant="outline" onClick={() => navigate(`/invoices/${invoice.id}/edit`)}>
                <Pencil className="w-4 h-4 mr-2" />
                Editar
              </Button>
            )}
            {isDraft && (
              <Button onClick={() => setShowIssueDialog(true)}>
                <Send className="w-4 h-4 mr-2" />
                Emitir
              </Button>
            )}
            {canEmitArca && (
              <Button variant="outline" onClick={() => setShowEmitDialog(true)}>
                <Zap className="w-4 h-4 mr-2" />
                Emitir a ARCA
              </Button>
            )}
            {canMarkAsPaid && remaining > 0 && !invoice.ordenPedidoId && (
              <Button variant="outline" onClick={() => setShowPayModal(true)}>
                <Banknote className="w-4 h-4 mr-2" />
                Registrar pago
              </Button>
            )}
            {invoice.deliveryStatus !== 'DELIVERED' && (
              <Button
                variant="outline"
                onClick={() => navigate(`/remitos/new?invoiceId=${invoice.id}`)}
              >
                <ClipboardList className="w-4 h-4 mr-2" />
                Generar remito
              </Button>
            )}
            <Button variant="outline" onClick={handleDownloadPDF} isLoading={isGeneratingPDF}>
              <FileDown className="w-4 h-4 mr-2" />
              PDF
            </Button>
            <Button variant="outline" onClick={() => window.open(`/print/invoice/${invoice.id}`, '_blank', 'width=420,height=700,scrollbars=yes')}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
            <Button variant="outline" onClick={() => setShowEmailModal(true)}>
              <Mail className="w-4 h-4 mr-2" />
              Enviar
            </Button>
            {canGenerateNC && (
              <Button
                variant="outline"
                onClick={() => navigate('/invoices/new', { state: { creditNoteFrom: invoice } })}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Generar NC
              </Button>
            )}
            {canGenerateND && (
              <Button
                variant="outline"
                onClick={() => navigate('/invoices/new', { state: { debitNoteFrom: invoice } })}
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Generar ND
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

      {/* Status strip */}
      {!isCancelled && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {(['DRAFT', 'ISSUED', 'PAID'] as const).map((step, i, arr) => {
            const labels: Record<string, string> = { DRAFT: 'Borrador', ISSUED: 'Emitida', PAID: 'Pagada' };
            const order = ['DRAFT', 'ISSUED', 'PAID'];
            const currentIdx = order.indexOf(invoice.status === 'PARTIALLY_PAID' ? 'ISSUED' : invoice.status);
            const stepIdx = order.indexOf(step);
            const isDone = stepIdx < currentIdx;
            const isCurrent = stepIdx === currentIdx;
            return (
              <div key={step} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors duration-200 ${
                  isCurrent ? 'bg-indigo-600 text-white' :
                  isDone ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' :
                  'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
                }`}>
                  {isDone && <CheckCircle className="w-3.5 h-3.5" />}
                  {labels[step]}
                </div>
                {i < arr.length - 1 && (
                  <ArrowRight className={`w-3 h-3 flex-shrink-0 ${stepIdx < currentIdx ? 'text-emerald-400 dark:text-emerald-500' : 'text-gray-300 dark:text-slate-600'}`} />
                )}
              </div>
            );
          })}
          {invoice.status === 'PARTIALLY_PAID' && (
            <Badge variant="warning" dot>Pago parcial</Badge>
          )}
        </div>
      )}

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-800 dark:text-red-300">
          <XCircle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" />
          Esta factura fue cancelada.
        </div>
      )}

      {/* OP banner when invoice was created from an OrdenPedido */}
      {invoice.ordenPedidoId && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-xl text-sm text-indigo-800 dark:text-indigo-300">
          <CheckCircle className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
          <span>Esta factura fue generada desde una Orden de Pedido. Los pagos se gestionan desde la orden.</span>
        </div>
      )}

      {/* CAE banner when issued via ARCA */}
      {invoice.cae && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm text-emerald-800 dark:text-emerald-300">
          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <span>Emitida ante ARCA.</span>
          <span className="font-mono font-semibold ml-1">CAE: {invoice.cae}</span>
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
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Producto</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Cantidad</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Precio unit.</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">IVA</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/50 transition-colors duration-100">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.product?.name ?? <span className="text-gray-400 dark:text-slate-500 italic">Producto eliminado</span>}
                        </p>
                        {item.product?.sku && (
                          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{item.product.sku}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-slate-300 text-right tabular-nums">{Number(item.quantity)}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-slate-300 text-right tabular-nums">
                        {formatCurrency(Number(item.unitPrice), invoice.currency)}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-slate-400 text-right tabular-nums">{Number(item.taxRate)}%</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-white text-right tabular-nums">
                        {formatCurrency(Number(item.total), invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50/50 dark:bg-slate-700/30 border-t border-gray-200 dark:border-slate-700">
                  <tr>
                    <td colSpan={4} className="px-5 py-3 text-right text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Subtotal</td>
                    <td className="px-5 py-3 text-right text-sm font-medium text-gray-700 dark:text-slate-300 tabular-nums">{formatCurrency(Number(invoice.subtotal), invoice.currency)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-5 py-2 text-right text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">IVA</td>
                    <td className="px-5 py-2 text-right text-sm font-medium text-gray-700 dark:text-slate-300 tabular-nums">{formatCurrency(Number(invoice.taxAmount), invoice.currency)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-5 py-3 text-right text-sm text-gray-900 dark:text-white font-bold uppercase tracking-wider">Total</td>
                    <td className="px-5 py-3 text-right text-base font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{formatCurrency(Number(invoice.total), invoice.currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {invoice.notes && (
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-5 py-4">
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Notas</p>
              <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">{invoice.notes}</p>
            </div>
          )}

          {/* Recibos */}
          <RecibosList
            recibos={recibos}
            total={Number(invoice.total)}
            currency={invoice.currency}
            canPay={canMarkAsPaid}
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
                <span className="text-sm text-gray-500 dark:text-slate-400">Tipo</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{INVOICE_TYPES[invoice.type]}</span>
              </div>
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Estado</span>
                <Badge variant={STATUS_VARIANT[invoice.status] ?? 'default'} dot>
                  {INVOICE_STATUSES[invoice.status]}
                </Badge>
              </div>
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-gray-500 dark:text-slate-400">Fecha</span>
                <span className="text-sm text-gray-900 dark:text-white tabular-nums">{formatDate(invoice.date)}</span>
              </div>
              {invoice.dueDate && (
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Vencimiento</span>
                  <span className="text-sm text-gray-900 dark:text-white tabular-nums">{formatDate(invoice.dueDate)}</span>
                </div>
              )}
              {invoice.paymentTerms && (
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Cond. de venta</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{invoice.paymentTerms}</span>
                </div>
              )}
              {invoice.deliveryStatus && (
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Entrega</span>
                  <Badge variant={DELIVERY_STATUS_VARIANT[invoice.deliveryStatus] ?? 'default'} dot>
                    {DELIVERY_STATUS_LABEL[invoice.deliveryStatus]}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* ARCA / CAE */}
          {invoice.cae && (
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
                <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">ARCA / AFIP</p>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-500 dark:text-slate-400">CAE</span>
                  <span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md">
                    {invoice.cae}
                  </span>
                </div>
                {invoice.caeExpiry && (
                  <div className="flex justify-between items-center px-5 py-3">
                    <span className="text-sm text-gray-500 dark:text-slate-400">Vto. CAE</span>
                    <span className="text-sm text-gray-900 dark:text-white tabular-nums">{formatDate(invoice.caeExpiry)}</span>
                  </div>
                )}
                {invoice.afipPtVenta && (
                  <div className="flex justify-between items-center px-5 py-3">
                    <span className="text-sm text-gray-500 dark:text-slate-400">Punto de venta</span>
                    <span className="text-sm text-gray-900 dark:text-white tabular-nums">{invoice.afipPtVenta}</span>
                  </div>
                )}
                {invoice.afipCbtNum && (
                  <div className="flex justify-between items-center px-5 py-3">
                    <span className="text-sm text-gray-500 dark:text-slate-400">N° AFIP</span>
                    <span className="text-sm text-gray-900 dark:text-white tabular-nums">{invoice.afipCbtNum}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Client */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Cliente</p>
            </div>
            <div className="px-5 py-4 space-y-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{invoice.customer?.name ?? '—'}</p>
              {invoice.customer?.taxId && (
                <p className="text-xs text-gray-500 dark:text-slate-400">CUIT: {invoice.customer.taxId}</p>
              )}
              {invoice.customer?.email && (
                <p className="text-xs text-gray-500 dark:text-slate-400">{invoice.customer.email}</p>
              )}
              {invoice.customer?.address && (
                <p className="text-xs text-gray-400 dark:text-slate-500">{invoice.customer.address}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancel}
        title="Cancelar factura"
        message="¿Estás seguro de que deseas cancelar esta factura? Esta acción revertirá los movimientos de stock y cuenta corriente asociados."
        confirmText="Cancelar factura"
        isLoading={isCanceling}
      />
      <ConfirmDialog
        isOpen={showIssueDialog}
        onClose={() => setShowIssueDialog(false)}
        onConfirm={handleIssue}
        title="Emitir factura"
        message="¿Confirmás que deseas emitir esta factura? Una vez emitida no podrás editar los ítems."
        confirmText="Emitir"
        variant="info"
        isLoading={isUpdating}
      />
      <ConfirmDialog
        isOpen={showEmitDialog}
        onClose={() => setShowEmitDialog(false)}
        onConfirm={handleEmitArca}
        title="Emitir ante ARCA"
        message="¿Confirmás que deseas emitir esta factura ante ARCA (AFIP)? Se obtendrá el CAE y la factura pasará a estado Emitida."
        confirmText="Emitir ante ARCA"
        variant="info"
        isLoading={isEmitting}
      />

      <PaymentModal
        open={showPayModal}
        onClose={() => setShowPayModal(false)}
        onSubmit={handlePay}
        remaining={remaining}
        currency={invoice.currency}
        isLoading={isPayLoading}
        defaultCashRegisterId={undefined}
      />

      <ConfirmDialog
        isOpen={!!cancelReciboId}
        onClose={() => setCancelReciboId(null)}
        onConfirm={handleCancelRecibo}
        title="Cancelar recibo"
        message="¿Estás seguro de que deseas cancelar este recibo? Se revertirá el movimiento de cuenta corriente y el estado de la factura se actualizará."
        confirmText="Cancelar recibo"
        isLoading={isCancellingRecibo}
      />

      <SendEmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        defaultEmail={(invoice as any)?.customer?.email ?? ''}
        documentLabel={invoice ? `${INVOICE_TYPES[invoice.type]} ${invoice.number}` : ''}
        onSend={async (to) => {
          await invoicesService.sendEmail(invoice!.id, to);
          toast.success('Correo enviado correctamente');
        }}
      />
    </div>
  );
}
