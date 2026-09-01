import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  XCircle, CheckCircle, Pencil, Send, Banknote, Zap, FileDown, ArrowRight, ClipboardList, RotateCcw, Printer, Mail, AlertTriangle, Smartphone, Trash2, ChevronDown, ArrowLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { pdf } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { Badge, Button } from '../../components/ui';
import { PageHeader, ConfirmDialog, PaymentModal, RecibosList, SendEmailModal, DocumentTimeline, RelatedDocuments } from '../../components/shared';
import type { TimelineEvent, RelatedDocGroup } from '../../components/shared';
import MercadoPagoPayModal from '../../components/shared/MercadoPagoPayModal';
import FiscalModeBadge from '../../components/shared/FiscalModeBadge';
import { invoicesService, recibosService, afipService, appSettingsService, activityLogsService, remitosService, ordenPedidosService } from '../../services';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { formatCurrency, formatDate, formatCuit, formatInvoiceNumber } from '../../utils/formatters';
import { buildAfipQrUrl } from '../../utils/afipFiscal';
import { INVOICE_TYPES, INVOICE_STATUSES } from '../../utils/constants';
import type { Invoice, Recibo, CreateReciboDTO, AfipError, ActivityLog, Remito, OrdenPedido } from '../../types';
import InvoicePDF from '../../components/pdf/InvoicePDF';
import InformalInvoicePDF from '../../components/pdf/InformalInvoicePDF';

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

type StatusVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'authorized';

const STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: 'default',
  ISSUED: 'info',
  AUTHORIZED: 'authorized',
  PAID: 'success',
  CANCELLED: 'error',
  PARTIALLY_PAID: 'warning',
};

interface MoreAction {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * Menú "Más": todo lo que no es la acción principal ni PDF/Enviar. Sustituye a
 * la fila de hasta trece botones outline que envolvía en dos líneas.
 */
function MoreActionsMenu({ actions }: { actions: MoreAction[] }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <Button
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Más
        <ChevronDown className={`w-4 h-4 ml-1.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-30 py-1"
        >
          {actions.map((action, i) => {
            const Icon = action.icon;
            const prevDanger = actions[i - 1]?.danger;
            return (
              <div key={action.label}>
                {action.danger && !prevDanger && i > 0 && (
                  <div className="my-1 border-t border-gray-100 dark:border-slate-700" />
                )}
                <button
                  type="button"
                  role="menuitem"
                  disabled={action.disabled}
                  title={action.disabled ? action.disabledReason : undefined}
                  onClick={() => { setOpen(false); action.onClick(); }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors ${
                    action.disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : action.danger
                        ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                        : 'text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {action.label}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  const { isInternetOnline } = useOnlineStatus();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [isPayLoading, setIsPayLoading] = useState(false);
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEmitting, setIsEmitting] = useState(false);
  const [showEmitDialog, setShowEmitDialog] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [printFormat, setPrintFormat] = useState<'A4' | 'THERMAL_80MM'>('A4');
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [afipErrors, setAfipErrors] = useState<AfipError[]>([]);
  const [cancelReciboId, setCancelReciboId] = useState<string | null>(null);
  const [isCancellingRecibo, setIsCancellingRecibo] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'history'>('items');
  const [showMpModal,    setShowMpModal]    = useState(false);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [linkedRemitos, setLinkedRemitos] = useState<Remito[]>([]);
  const [sourceOp, setSourceOp] = useState<OrdenPedido | null>(null);

  const loadData = async () => {
    if (!id) return;
    try {
      const [invoiceData, recibosData, afipErrorsData, logsData, remitosData] = await Promise.all([
        invoicesService.getById(id),
        recibosService.getAll({ invoiceId: id }),
        invoicesService.getAfipErrors(id).catch(() => []),
        activityLogsService.getAll({ entityId: id, limit: 100 }).catch(() => ({ data: [] as ActivityLog[] })),
        remitosService.getAll({ invoiceId: id, limit: 50 }).catch(() => ({ data: [] as Remito[] })),
      ]);
      setInvoice(invoiceData);
      setRecibos(recibosData.data);
      setAfipErrors(afipErrorsData);
      setLogs(logsData.data);
      setLinkedRemitos(remitosData.data);
      if (invoiceData.ordenPedidoId) {
        ordenPedidosService.getById(invoiceData.ordenPedidoId)
          .then(setSourceOp)
          .catch(() => setSourceOp(null));
      } else {
        setSourceOp(null);
      }
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

  useEffect(() => {
    appSettingsService.get()
      .then((s) => {
        const fmt = (s.printFormatInvoice ?? s.printFormat ?? 'A4') as 'A4' | 'THERMAL_80MM';
        setPrintFormat(fmt);
      })
      .catch(() => {});
  }, []);

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

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await invoicesService.delete(id);
      toast.success('Factura eliminada');
      setShowDeleteDialog(false);
      navigate('/invoices');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al eliminar factura');
      setIsDeleting(false);
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
      const { invoice: updated, warnings } = await afipService.emitInvoice(id);
      toast.success(`Factura emitida ante ARCA. CAE: ${updated.cae}`);
      if (warnings) {
        toast(`Observaciones ARCA: ${warnings}`, { icon: '⚠️', duration: 8000 });
      }
      setShowEmitDialog(false);
      await loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al emitir ante ARCA');
    } finally {
      setIsEmitting(false);
    }
  };

  const generateInvoicePdfBlob = async (): Promise<Blob> => {
    const afipConfig = await afipService.getConfig();
    // Informal (sin CAE, sin validez fiscal): formato reducido, 2 comprobantes
    // por hoja A4 — no lleva QR/CAE ni desglose de IVA.
    if (invoice!.fiscalMode === 'INFORMAL') {
      return pdf(<InformalInvoicePDF invoice={invoice!} afipConfig={afipConfig} />).toBlob();
    }
    let qrCodeDataUrl: string | undefined;
    const qrUrl = buildAfipQrUrl(invoice!, afipConfig?.cuit, afipConfig?.salePoint);
    if (qrUrl) {
      qrCodeDataUrl = await QRCode.toDataURL(qrUrl, { width: 150, margin: 1 });
    }
    return pdf(
      <InvoicePDF invoice={invoice!} afipConfig={afipConfig} qrCodeDataUrl={qrCodeDataUrl} />
    ).toBlob();
  };

  const handleDownloadPDF = async () => {
    if (!invoice) return;
    setIsGeneratingPDF(true);
    try {
      const blob = await generateInvoicePdfBlob();
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

  const handlePrint = async () => {
    if (!invoice) return;
    if (printFormat === 'THERMAL_80MM') {
      window.open(`/print/invoice/${invoice.id}`, '_blank', 'width=420,height=700,scrollbars=yes');
      return;
    }
    // A4 → genera el PDF y dispara el diálogo de impresión directo, sin pasar
    // por una pestaña/visor intermedio (iframe oculto, igual que el circuito
    // ya automático del ticket térmico).
    setIsGeneratingPDF(true);
    try {
      const blob = await generateInvoicePdfBlob();
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = url;
      document.body.appendChild(iframe);

      const cleanup = () => { URL.revokeObjectURL(url); iframe.remove(); };
      iframe.onload = () => {
        const win = iframe.contentWindow;
        if (!win) { cleanup(); return; }
        win.focus();
        win.print();
        win.onafterprint = cleanup;
      };
      // Red de seguridad por si el navegador no dispara "afterprint" en el visor de PDF embebido.
      setTimeout(cleanup, 120000);
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
  const activeRecibos = recibos.filter((r) => r.status === 'EMITTED');
  const paidAmount = activeRecibos.reduce((sum, r) => sum + Number(r.amount), 0);
  const remaining = Math.max(0, Number(invoice.total) - paidAmount);
  const isCancelled = invoice.status === 'CANCELLED';
  // Espejo de las guardas del backend: una factura autorizada por ARCA no se
  // anula (se revierte con NC) y una con cobros exige cancelar antes sus recibos.
  const canCancel =
    invoice.status !== 'CANCELLED' &&
    invoice.status !== 'PAID' &&
    invoice.status !== 'AUTHORIZED' &&
    !invoice.cae &&
    activeRecibos.length === 0;
  const canMarkAsPaid = invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && invoice.status !== 'DRAFT';
  const isFactura = ['FACTURA_A', 'FACTURA_B', 'FACTURA_C'].includes(invoice.type);
  // Una NC no se cobra: su "pago" es una devolución al cliente.
  const isCreditNote = invoice.type.startsWith('NOTA_CREDITO');
  // Factura C does not discriminate IVA
  const isTypeC = invoice.type.endsWith('_C');
  const hasItemDiscount = invoice.items.some((i) => Number(i.discountPct) > 0);
  const footerColSpan = (hasItemDiscount ? 4 : 3) + (isTypeC ? 0 : 1);
  const isNcNdStatus = ['ISSUED', 'AUTHORIZED', 'PAID', 'PARTIALLY_PAID'].includes(invoice.status);
  const canGenerateNC = isFactura && isNcNdStatus;
  const canGenerateND = isFactura && isNcNdStatus;
  const canEmitArca = ['DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID'].includes(invoice.status) && !invoice.cae && invoice.fiscalMode !== 'INFORMAL';
  // Un borrador no movió stock: entregar por remito descontaría mercadería inexistente.
  const canGenerateRemito = !isDraft && !isCancelled && invoice.deliveryStatus !== 'DELIVERED';

  /** Días de atraso del saldo, o null si no está vencida. */
  const overdueDays = (() => {
    if (!invoice.dueDate || isCancelled || isDraft || remaining <= 0.009) return null;
    const due = new Date(invoice.dueDate);
    due.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
    return days > 0 ? days : null;
  })();

  const canRegisterPayment = canMarkAsPaid && remaining > 0 && !invoice.ordenPedidoId;

  /**
   * Una sola acción primaria, la que corresponde al estado. Antes había hasta
   * trece botones del mismo peso y la que importaba se perdía entre las demás.
   */
  const primaryAction: { label: string; icon: typeof Send; onClick: () => void } | null =
    isCancelled ? null
    : isDraft ? { label: 'Emitir', icon: Send, onClick: () => setShowIssueDialog(true) }
    : canRegisterPayment
      ? {
          label: isCreditNote ? 'Registrar devolución' : 'Registrar cobro',
          icon: Banknote,
          onClick: () => setShowPayModal(true),
        }
      : null;

  /** Todo lo demás, detrás de "Más". El orden es de más a menos frecuente. */
  const moreActions: MoreAction[] = [
    ...(isDraft ? [{ label: 'Editar', icon: Pencil, onClick: () => navigate(`/invoices/${invoice.id}/edit`) }] : []),
    ...(canEmitArca ? [{
      label: 'Emitir a ARCA',
      icon: Zap,
      onClick: () => setShowEmitDialog(true),
      disabled: !isInternetOnline,
      disabledReason: 'Sin conexión a internet — ARCA no disponible',
    }] : []),
    ...(canRegisterPayment && !isCreditNote ? [{ label: 'Cobrar con MercadoPago', icon: Smartphone, onClick: () => setShowMpModal(true) }] : []),
    ...(canGenerateRemito ? [{ label: 'Generar remito', icon: ClipboardList, onClick: () => navigate(`/remitos/new?invoiceId=${invoice.id}`) }] : []),
    { label: `Imprimir (${printFormat === 'THERMAL_80MM' ? '80mm' : 'A4'})`, icon: Printer, onClick: handlePrint },
    ...(canGenerateNC ? [{ label: 'Generar nota de crédito', icon: RotateCcw, onClick: () => navigate('/invoices/new', { state: { creditNoteFrom: invoice } }) }] : []),
    ...(canGenerateND ? [{ label: 'Generar nota de débito', icon: ArrowRight, onClick: () => navigate('/invoices/new', { state: { debitNoteFrom: invoice } }) }] : []),
    ...(isDraft ? [{ label: 'Eliminar borrador', icon: Trash2, onClick: () => setShowDeleteDialog(true), danger: true }] : []),
    ...(canCancel && !isDraft ? [{ label: 'Anular factura', icon: XCircle, onClick: () => setShowCancelDialog(true), danger: true }] : []),
  ];

  // ── Timeline: creada → emitida → CAE → cobros → saldo ──
  const timelineEvents: TimelineEvent[] = (() => {
    const dated: TimelineEvent[] = [{ date: invoice.createdAt, title: 'Creada', detail: 'Borrador' }];
    for (const log of logs) {
      if (log.entity === 'Invoice' && log.action === 'UPDATE' && log.description.includes('emitida')) {
        dated.push({ date: log.createdAt, title: 'Emitida' });
      }
      if (log.entity === 'AfipEmission') {
        dated.push({ date: log.createdAt, title: 'CAE otorgado por ARCA', detail: invoice.cae ?? undefined, tone: 'success' });
      }
      if (log.entity === 'Invoice' && log.action === 'CANCEL') {
        dated.push({ date: log.createdAt, title: 'Anulada', tone: 'danger' });
      }
    }
    // Facturas emitidas antes de que existiera el log de emisión
    if (!isDraft && !dated.some((e) => e.title === 'Emitida' || e.title.startsWith('CAE'))) {
      dated.push({ date: invoice.date, title: 'Emitida' });
    }
    for (const r of activeRecibos) {
      dated.push({
        date: r.date,
        title: `${isCreditNote ? 'Devolución' : 'Cobro'} ${r.number}`,
        detail: formatCurrency(Number(r.amount), invoice.currency),
        tone: 'success',
      });
    }
    // Los remitos existían solo en "Documentos relacionados", sin fecha ni
    // orden respecto del resto: en la historia cuentan cuándo se entregó.
    for (const r of linkedRemitos) {
      if (r.status === 'CANCELLED') continue;
      dated.push({
        date: r.date,
        title: `${r.status === 'DELIVERED' ? 'Entrega' : 'Entrega parcial'} · remito ${r.number}`,
        tone: r.status === 'DELIVERED' ? 'success' : 'pending',
      });
    }
    dated.sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime());
    // Estado final (sin fecha): qué falta
    if (isCancelled) return dated;
    if (invoice.status === 'PAID') {
      dated.push({ title: isCreditNote ? 'Devuelta por completo' : 'Cobrada por completo', tone: 'success' });
    } else if (!isDraft && remaining > 0.009) {
      dated.push({ title: `Saldo pendiente: ${formatCurrency(remaining, invoice.currency)}`, tone: 'pending' });
    }
    return dated;
  })();

  // ── Documentos relacionados: la cadena presupuesto → orden → factura → remito ──
  const relatedGroups: RelatedDocGroup[] = [
    {
      title: 'Origen',
      docs: [
        ...(sourceOp ? [{ label: `Orden de Pedido ${sourceOp.number}`, to: `/orden-pedidos/${sourceOp.id}`, detail: formatDate(sourceOp.date) }] : []),
        ...(invoice.originInvoiceId
          ? [{
              label: invoice.originInvoice
                ? `${INVOICE_TYPES[invoice.originInvoice.type]} ${formatInvoiceNumber(invoice.originInvoice)}`
                : 'Comprobante de origen',
              to: `/invoices/${invoice.originInvoiceId}`,
            }]
          : []),
      ],
    },
    {
      title: 'Remitos',
      docs: linkedRemitos.map((r) => ({
        label: r.number,
        to: `/remitos/${r.id}`,
        badge: r.status === 'DELIVERED' ? 'Entregado' : r.status === 'CANCELLED' ? 'Cancelado' : r.status === 'PARTIALLY_DELIVERED' ? 'Parcial' : 'Pendiente',
        detail: formatDate(r.date),
      })),
    },
    {
      title: 'Recibos',
      docs: activeRecibos.map((r) => ({
        label: r.number,
        to: `/recibos/${r.id}`,
        detail: formatCurrency(Number(r.amount), invoice.currency),
      })),
    },
  ];

  return (
    <div>
      {/* ── Cabecera: identidad, plata y una sola acción principal ── */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl mb-6">
        <div className="px-5 pt-4 pb-4 flex flex-col lg:flex-row lg:items-start gap-5">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate('/invoices')}
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Facturas
            </button>

            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ring-1 ring-inset text-indigo-700 bg-indigo-50 ring-indigo-200/60 dark:text-indigo-300 dark:bg-indigo-900/30 dark:ring-indigo-700/60 leading-none uppercase">
                {INVOICE_TYPES[invoice.type]}
              </span>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight tabular-nums">
                {formatInvoiceNumber(invoice)}
              </h1>
              <Badge variant={STATUS_VARIANT[invoice.status] ?? 'default'} dot>
                {INVOICE_STATUSES[invoice.status]}
              </Badge>
              <FiscalModeBadge mode={invoice.fiscalMode} />
            </div>

            <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
              <span className="font-semibold text-gray-900 dark:text-white">{invoice.customer?.name ?? 'Consumidor final'}</span>
              {invoice.customer?.taxId && <> · CUIT {formatCuit(invoice.customer.taxId)}</>}
              <> · {formatDate(invoice.date)}</>
              {invoice.dueDate && <> · vence {formatDate(invoice.dueDate)}</>}
            </p>
            {overdueDays !== null && (
              <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
                Vencida hace {overdueDays} {overdueDays === 1 ? 'día' : 'días'}
              </p>
            )}
          </div>

          {/* Total / cobrado / saldo — lo que antes estaba al pie de la tabla */}
          <div className="flex items-start gap-6 lg:gap-7 shrink-0 lg:text-right">
            <div>
              <p className="text-[11px] text-gray-500 dark:text-slate-400">Total</p>
              <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white tabular-nums">
                {formatCurrency(Number(invoice.total), invoice.currency)}
              </p>
            </div>
            {!isDraft && (
              <div>
                <p className="text-[11px] text-gray-500 dark:text-slate-400">{isCreditNote ? 'Devuelto' : 'Cobrado'}</p>
                <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatCurrency(paidAmount, invoice.currency)}
                </p>
              </div>
            )}
            {!isDraft && remaining > 0.009 && (
              <div className="pl-6 lg:pl-7 border-l border-gray-200 dark:border-slate-700">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Saldo</p>
                <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400 tracking-tight tabular-nums">
                  {formatCurrency(remaining, invoice.currency)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Avance del cobro */}
        {!isDraft && !isCancelled && Number(invoice.total) > 0 && (
          <div className="mx-5 h-1 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-[width] duration-300"
              style={{ width: `${Math.min(100, (paidAmount / Number(invoice.total)) * 100)}%` }}
            />
          </div>
        )}

        {/* Acciones: una primaria, dos frecuentes, el resto en el menú */}
        <div className="px-5 py-3.5 flex items-center gap-2 flex-wrap">
          {primaryAction && (
            <Button onClick={primaryAction.onClick}>
              <primaryAction.icon className="w-4 h-4 mr-2" />
              {primaryAction.label}
            </Button>
          )}
          <Button variant="outline" onClick={handleDownloadPDF} isLoading={isGeneratingPDF}>
            <FileDown className="w-4 h-4 mr-2" />
            PDF
          </Button>
          <Button variant="outline" onClick={() => setShowEmailModal(true)}>
            <Mail className="w-4 h-4 mr-2" />
            Enviar
          </Button>
          {moreActions.length > 0 && (
            <MoreActionsMenu actions={moreActions} />
          )}

          {invoice.cae && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
              <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">CAE {invoice.cae}</span>
              {invoice.caeExpiry && <span className="hidden sm:inline">· vto. {formatDate(invoice.caeExpiry)}</span>}
            </span>
          )}
        </div>
      </div>


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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">

        {/* ── Left: items table + notes ── */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            {/* Ítems por defecto; Historia al lado, que antes vivía perdida
                al fondo del sidebar. */}
            <div className="px-5 border-b border-gray-100 dark:border-slate-700 flex items-center gap-6">
              {([
                { key: 'items' as const, label: 'Ítems', count: invoice.items.length },
                { key: 'history' as const, label: 'Historia', count: timelineEvents.length },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  aria-current={activeTab === tab.key ? 'page' : undefined}
                  className={`flex items-center gap-1.5 py-3 text-sm border-b-2 -mb-px transition-colors ${
                    activeTab === tab.key
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
                      : 'border-transparent text-gray-500 dark:text-slate-400 font-medium hover:text-gray-800 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full leading-none ${
                    activeTab === tab.key
                      ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300'
                      : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {activeTab === 'history' && (
              <div className="px-5 py-5">
                <DocumentTimeline events={timelineEvents} />
              </div>
            )}

            <div className={`overflow-x-auto ${activeTab === 'items' ? '' : 'hidden'}`}>
              <table className="min-w-full">
                <thead className="bg-gray-50/80 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Producto</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Cantidad</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Precio unit.</th>
                    {invoice.items.some((i) => Number(i.discountPct) > 0) && (
                      <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Desc.%</th>
                    )}
                    {!isTypeC && (
                      <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">IVA</th>
                    )}
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
                        {item.variant && (
                          <p className="text-[11px] text-violet-600 dark:text-violet-400 font-medium mt-0.5">
                            {item.variant.name}
                          </p>
                        )}
                        {(item.variant?.sku ?? item.product?.sku) && (
                          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{item.variant?.sku ?? item.product?.sku}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-slate-300 text-right tabular-nums">{Number(item.quantity)}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-slate-300 text-right tabular-nums">
                        {formatCurrency(Number(item.unitPrice), invoice.currency)}
                      </td>
                      {invoice.items.some((i) => Number(i.discountPct) > 0) && (
                        <td className="px-5 py-3.5 text-sm text-right tabular-nums">
                          {Number(item.discountPct) > 0
                            ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">{Number(item.discountPct)}%</span>
                            : <span className="text-gray-300 dark:text-slate-600">—</span>
                          }
                        </td>
                      )}
                      {!isTypeC && (
                        <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-slate-400 text-right tabular-nums">{Number(item.taxRate)}%</td>
                      )}
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-white text-right tabular-nums">
                        {formatCurrency(Number(item.total), invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50/50 dark:bg-slate-700/30 border-t border-gray-200 dark:border-slate-700">
                  <tr>
                    <td colSpan={footerColSpan} className="px-5 py-3 text-right text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Subtotal</td>
                    <td className="px-5 py-3 text-right text-sm font-medium text-gray-700 dark:text-slate-300 tabular-nums">{formatCurrency(Number(invoice.subtotal), invoice.currency)}</td>
                  </tr>
                  {!isTypeC && (
                    <tr>
                      <td colSpan={footerColSpan} className="px-5 py-2 text-right text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">IVA</td>
                      <td className="px-5 py-2 text-right text-sm font-medium text-gray-700 dark:text-slate-300 tabular-nums">{formatCurrency(Number(invoice.taxAmount), invoice.currency)}</td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={footerColSpan} className="px-5 py-3 text-right text-sm text-gray-900 dark:text-white font-bold uppercase tracking-wider">Total</td>
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
            mode={isCreditNote ? 'refund' : 'payment'}
          />

          {/* AFIP / ARCA Error History */}
          {afipErrors.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900/40 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-red-100 dark:border-red-900/30 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">
                  Errores ARCA ({afipErrors.length})
                </p>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {afipErrors.map((err) => (
                  <div key={err.id} className="px-5 py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        err.errorType === 'AUTH_ERROR' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        err.errorType === 'CAE_REJECTED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        err.errorType === 'HARD_ERROR' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        err.errorType === 'CONNECTION_ERROR' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                        'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400'
                      }`}>
                        {err.errorType ?? 'UNKNOWN'}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-slate-500 tabular-nums">
                        {new Date(err.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-slate-400 break-words">{err.errorMessage}</p>
                  </div>
                ))}
              </div>
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
                {invoice.afipObservaciones && (
                  <div className="px-5 py-3">
                    <span className="text-sm text-gray-500 dark:text-slate-400 block mb-1">Observaciones ARCA</span>
                    <span className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5 block leading-relaxed">
                      {invoice.afipObservaciones}
                    </span>
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
                <p className="text-xs text-gray-500 dark:text-slate-400">CUIT: {formatCuit(invoice.customer.taxId)}</p>
              )}
              {invoice.customer?.email && (
                <p className="text-xs text-gray-500 dark:text-slate-400">{invoice.customer.email}</p>
              )}
              {invoice.customer?.address && (
                <p className="text-xs text-gray-400 dark:text-slate-500">{invoice.customer.address}</p>
              )}
            </div>
          </div>

          {/* Documentos relacionados. La historia ya no va acá: se movió a la
              pestaña Historia, junto a los ítems. */}
          <RelatedDocuments groups={relatedGroups} />
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
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Eliminar borrador"
        message="¿Eliminar esta factura en borrador? Como no fue emitida, no generó movimientos. Esta acción no se puede deshacer."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
      <ConfirmDialog
        isOpen={showIssueDialog}
        onClose={() => setShowIssueDialog(false)}
        onConfirm={handleIssue}
        title="Emitir factura"
        message="¿Confirmás que deseas emitir esta factura? Al emitirla se generan los movimientos de stock y cuenta corriente, y ya no podrás editar los ítems."
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
        total={Number(invoice.total)}
        paidCount={recibos.filter((r) => r.status === 'EMITTED').length}
        currency={invoice.currency}
        isLoading={isPayLoading}
        defaultCashRegisterId={undefined}
        mode={isCreditNote ? 'refund' : 'payment'}
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

      <MercadoPagoPayModal
        open={showMpModal}
        onClose={() => setShowMpModal(false)}
        onPaymentRegistered={loadData}
        invoiceId={invoice.id}
        title={`Cobrar Factura ${formatInvoiceNumber(invoice)} con MP`}
      />

      <SendEmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        defaultEmail={(invoice as any)?.customer?.email ?? ''}
        documentLabel={invoice ? `${INVOICE_TYPES[invoice.type]} ${formatInvoiceNumber(invoice)}` : ''}
        onSend={async (to) => {
          const blob = await generateInvoicePdfBlob();
          await invoicesService.sendEmail(invoice!.id, to, blob);
          toast.success('Correo enviado correctamente');
        }}
      />
    </div>
  );
}
