import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Building2, Calendar, Hash, Banknote,
  XCircle, FileText, Package, CheckCircle2,
  User, Link2, Warehouse, Receipt, Plus,
  Pencil, Trash2, AlertTriangle, Clock,
} from 'lucide-react';
import { Card, Button } from '../../components/ui';
import { PageHeader, ConfirmDialog, AddPurchaseInvoiceModal } from '../../components/shared';
import { purchasesService } from '../../services';
import { formatCurrency, formatDate, formatCuit } from '../../utils/formatters';
import type { Purchase, PurchaseInvoice, CreatePurchaseInvoiceDTO } from '../../types';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'Transferencia',
  CASH:          'Efectivo',
  CHECK:         'Cheque',
  CARD:          'Tarjeta',
  OTHER:         'Otro',
};

const INVOICE_TYPE_LABELS: Record<string, string> = {
  FACTURA_A:      'Factura A',
  FACTURA_B:      'Factura B',
  FACTURA_C:      'Factura C',
  FACTURA_M:      'Factura M',
  NOTA_DEBITO_A:  'ND A',
  NOTA_DEBITO_B:  'ND B',
  NOTA_CREDITO_A: 'NC A',
  NOTA_CREDITO_B: 'NC B',
  RECIBO:         'Recibo',
  OTRO:           'Otro',
};

// ── Status config ────────────────────────────────────────────────
const STATUS_CFG = {
  REGISTERED: { label: 'Registrada', icon: CheckCircle2, className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  CANCELLED:  { label: 'Cancelada',  icon: XCircle,      className: 'text-red-600    bg-red-50    border-red-200'    },
} as const;

// ── Info row ─────────────────────────────────────────────────────
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5 text-gray-400 dark:text-slate-400">
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-400 dark:text-slate-500 leading-none mb-0.5">{label}</p>
        <div className="text-sm font-medium text-gray-800 dark:text-slate-200">{value}</div>
      </div>
    </div>
  );
}

// ── Due date badge ────────────────────────────────────────────────
function DueDateBadge({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return <span className="text-gray-400 text-xs">Sin vencimiento</span>;
  const now   = new Date();
  const due   = new Date(dueDate);
  const diff  = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-3 h-3" />
        Vencida hace {Math.abs(diff)}d
      </span>
    );
  if (diff === 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-3 h-3" />
        Vence hoy
      </span>
    );
  if (diff <= 7)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
        <Clock className="w-3 h-3" />
        {formatDate(dueDate)} ({diff}d)
      </span>
    );
  return (
    <span className="text-xs text-gray-500 dark:text-slate-400">{formatDate(dueDate)}</span>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-xl w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="h-12 bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 border-b border-gray-100 dark:border-slate-700 mx-5 my-2 bg-gray-100 dark:bg-slate-700 rounded-lg" />
            ))}
            <div className="h-20 bg-gray-50/60 dark:bg-slate-700/30 mx-0" />
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />)}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [purchase,    setPurchase]    = useState<Purchase | null>(null);
  const [invoices,    setInvoices]    = useState<PurchaseInvoice[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [cancelId,    setCancelId]    = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [showInvModal, setShowInvModal]   = useState(false);
  const [editingInv,   setEditingInv]     = useState<PurchaseInvoice | null>(null);
  const [savingInv,    setSavingInv]      = useState(false);
  const [deletingInv,  setDeletingInv]    = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    Promise.all([
      purchasesService.getById(id),
      purchasesService.getInvoices(id),
    ])
      .then(([p, invs]) => { setPurchase(p); setInvoices(invs); })
      .catch(() => {
        toast.error('Error al cargar la compra');
        navigate('/purchases');
      })
      .finally(() => setIsLoading(false));
  }, [id, navigate]);

  const handleCancel = async () => {
    if (!cancelId) return;
    setIsCanceling(true);
    try {
      await purchasesService.cancel(cancelId);
      toast.success('Compra cancelada');
      setCancelId(null);
      const updated = await purchasesService.getById(id!);
      setPurchase(updated);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al cancelar');
    } finally {
      setIsCanceling(false);
    }
  };

  const handleSaveInvoice = async (data: CreatePurchaseInvoiceDTO) => {
    setSavingInv(true);
    try {
      if (editingInv) {
        const updated = await purchasesService.updateInvoice(id!, editingInv.id, data);
        setInvoices((prev) => prev.map((i) => (i.id === editingInv.id ? updated : i)));
        toast.success('Factura actualizada');
      } else {
        const added = await purchasesService.addInvoice(id!, data);
        setInvoices((prev) => [...prev, added]);
        toast.success('Factura agregada');
      }
      setShowInvModal(false);
      setEditingInv(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al guardar');
    } finally {
      setSavingInv(false);
    }
  };

  const handleDeleteInvoice = async (invId: string) => {
    setDeletingInv(null);
    try {
      await purchasesService.deleteInvoice(id!, invId);
      setInvoices((prev) => prev.filter((i) => i.id !== invId));
      toast.success('Factura eliminada');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al eliminar');
    }
  };

  if (isLoading) return (
    <div>
      <PageHeader title="Detalle de compra" backTo="/purchases" />
      <PageSkeleton />
    </div>
  );

  if (!purchase) return null;

  const statusCfg  = STATUS_CFG[purchase.status];
  const StatusIcon  = statusCfg.icon;
  const linkedCount = purchase.items.filter((i) => i.productId).length;

  // Tax breakdown by rate
  const taxByRate = purchase.items.reduce<Record<string, number>>((acc, item) => {
    const rate = String(item.taxRate);
    acc[rate] = (acc[rate] ?? 0) + Number(item.taxAmount);
    return acc;
  }, {});
  const taxRates = Object.keys(taxByRate).map(Number).sort((a, b) => a - b);
  const hasMultipleRates = taxRates.length > 1;

  const pendingInvoices = invoices.filter((i) => i.status === 'PENDING');
  const totalInvoiced   = invoices.reduce((s, i) => s + Number(i.amount), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Compra ${purchase.number}`}
        subtitle={`Registrada el ${formatDate(purchase.createdAt)}`}
        backTo="/purchases"
        actions={
          purchase.status === 'REGISTERED' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelId(purchase.id)}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <XCircle className="w-3.5 h-3.5 mr-1.5" />
              Cancelar compra
            </Button>
          )
        }
      />

      {/* ── Identity bar ── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusCfg.className}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {statusCfg.label}
        </span>
        <span className="hidden sm:block w-px h-4 bg-gray-200 dark:bg-slate-600" />
        <span className="flex items-center gap-1.5 text-gray-600 dark:text-slate-300">
          <Building2 className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
          {purchase.supplier?.name ?? '—'}
        </span>
        <span className="hidden sm:block w-px h-4 bg-gray-200 dark:bg-slate-600" />
        <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400">
          <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
          {formatDate(purchase.date)}
        </span>
        {purchase.currency !== 'ARS' && (
          <>
            <span className="hidden sm:block w-px h-4 bg-gray-200" />
            <span className="text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
              {purchase.currency}
            </span>
          </>
        )}
        {linkedCount > 0 && (
          <>
            <span className="hidden sm:block w-px h-4 bg-gray-200" />
            <span className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
              <Link2 className="w-3.5 h-3.5" />
              {linkedCount} {linkedCount === 1 ? 'ítem vinculado' : 'ítems vinculados'} a stock
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">

        {/* ── Left: items + supplier invoices ── */}
        <div className="space-y-4">
          {/* Items */}
          <Card padding="none">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <Package className="w-4 h-4 text-gray-400 dark:text-slate-500" />
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                Ítems
                <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-slate-500">· {purchase.items.length}</span>
              </h3>
            </div>

            <div className="hidden md:grid grid-cols-[3fr_56px_108px_56px_108px] gap-3 px-5 py-2.5 bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
              <span>Descripción</span>
              <span className="text-right">Cant.</span>
              <span className="text-right">Precio unit.</span>
              <span className="text-right">IVA</span>
              <span className="text-right">Total</span>
            </div>

            <div className="divide-y divide-gray-50 dark:divide-slate-700">
              {purchase.items.map((item) => (
                <div key={item.id} className="grid grid-cols-1 md:grid-cols-[3fr_56px_108px_56px_108px] gap-3 px-5 py-3.5 items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-200 leading-tight">{item.description}</p>
                    {item.productId && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full">
                        <Link2 className="w-2.5 h-2.5" />
                        Vinculado a producto
                      </span>
                    )}
                  </div>
                  <div className="md:text-right">
                    <span className="text-xs text-gray-400 md:hidden">Cant. </span>
                    <span className="text-sm text-gray-700 dark:text-slate-300 tabular-nums">{item.quantity}</span>
                  </div>
                  <div className="md:text-right">
                    <span className="text-xs text-gray-400 dark:text-slate-500 md:hidden">Precio unit. </span>
                    <span className="text-sm text-gray-600 dark:text-slate-400 tabular-nums">{formatCurrency(Number(item.unitPrice), purchase.currency)}</span>
                  </div>
                  <div className="md:text-right">
                    <span className="text-xs text-gray-400 dark:text-slate-500 md:hidden">IVA </span>
                    <span className="text-xs font-semibold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">{item.taxRate}%</span>
                  </div>
                  <div className="md:text-right">
                    <span className="text-xs text-gray-400 dark:text-slate-500 md:hidden">Total </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{formatCurrency(Number(item.total), purchase.currency)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals footer */}
            <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-700/30 flex justify-end">
              <div className="space-y-2 text-sm w-60">
                <div className="flex justify-between text-gray-500 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(Number(purchase.subtotal), purchase.currency)}</span>
                </div>
                {hasMultipleRates ? (
                  taxRates.map((rate) => (
                    <div key={rate} className="flex justify-between text-gray-400 dark:text-slate-500 text-xs">
                      <span>IVA {rate}%</span>
                      <span className="tabular-nums">{formatCurrency(taxByRate[String(rate)], purchase.currency)}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between text-gray-500 dark:text-slate-400">
                    <span>IVA{taxRates.length === 1 ? ` ${taxRates[0]}%` : ''}</span>
                    <span className="tabular-nums">{formatCurrency(Number(purchase.taxAmount), purchase.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t border-gray-200 dark:border-slate-600 pt-2.5 text-gray-900 dark:text-white">
                  <span>Total</span>
                  <span className="tabular-nums text-indigo-600">{formatCurrency(Number(purchase.total), purchase.currency)}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Supplier invoices */}
          <Card padding="none">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                  Facturas del proveedor
                  <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-slate-500">· {invoices.length}</span>
                </h3>
                {pendingInvoices.length > 0 && (
                  <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    {pendingInvoices.length} pendiente{pendingInvoices.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {purchase.status === 'REGISTERED' && (
                <Button size="sm" variant="outline" onClick={() => { setEditingInv(null); setShowInvModal(true); }}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Agregar
                </Button>
              )}
            </div>

            <div className="p-4 space-y-2">
              {invoices.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-4">
                  No hay facturas cargadas aún.
                </p>
              ) : (
                <>
                  {invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className={`rounded-xl border px-4 py-3 ${
                        inv.status === 'PAID'
                          ? 'border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-900/10'
                          : 'border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800'
                      }`}
                    >
                      {/* Row 1: number + type + amount + actions */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800 dark:text-slate-200 font-mono">{inv.number}</span>
                          <span className="text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">
                            {INVOICE_TYPE_LABELS[inv.type] ?? inv.type}
                          </span>
                          <span className="text-xs text-gray-400">
                            {PAYMENT_METHOD_LABELS[inv.paymentMethod] ?? inv.paymentMethod}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                            {formatCurrency(Number(inv.amount), purchase.currency)}
                          </span>
                          {/* Status badge (read-only — payment via Orden de Pago) */}
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                            inv.status === 'PAID'
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800'
                              : 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-800'
                          }`}>
                            {inv.status === 'PAID'
                              ? <><CheckCircle2 className="w-3 h-3" /> Pagada</>
                              : <><Clock className="w-3 h-3" /> Pendiente</>
                            }
                          </span>
                          {purchase.status === 'REGISTERED' && (
                            <>
                              <button onClick={() => { setEditingInv(inv); setShowInvModal(true); }}
                                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-indigo-500 transition-colors">
                                <Pencil className="w-3 h-3" />
                              </button>
                              {inv.status !== 'PAID' && (
                                <button onClick={() => setDeletingInv(inv.id)}
                                  className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Row 2: IVA breakdown + due date */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                        {Number(inv.subtotal) > 0 && (
                          <span className="text-xs text-gray-400 dark:text-slate-500">
                            Neto {formatCurrency(Number(inv.subtotal), purchase.currency)}
                            {' + '}IVA {inv.taxRate}% {formatCurrency(Number(inv.taxAmount), purchase.currency)}
                          </span>
                        )}
                        <DueDateBadge dueDate={inv.dueDate} />
                        {inv.notes && (
                          <span className="text-xs text-gray-400 truncate">{inv.notes}</span>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Total invoiced */}
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-slate-700 px-1">
                    <span className="text-xs text-gray-400 dark:text-slate-500">Total facturado</span>
                    <span className={`text-sm font-bold tabular-nums ${
                      Math.abs(totalInvoiced - Number(purchase.total)) < 0.01
                        ? 'text-emerald-600'
                        : 'text-amber-600'
                    }`}>
                      {formatCurrency(totalInvoiced, purchase.currency)}
                      {Math.abs(totalInvoiced - Number(purchase.total)) >= 0.01 && (
                        <span className="ml-1.5 text-xs font-normal text-amber-500">
                          (dif. {formatCurrency(Math.abs(totalInvoiced - Number(purchase.total)), purchase.currency)})
                        </span>
                      )}
                    </span>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* Notes */}
          {purchase.notes && (
            <Card>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                <span className="text-sm font-semibold text-gray-600 dark:text-slate-400">Notas</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">{purchase.notes}</p>
            </Card>
          )}
        </div>

        {/* ── Right: metadata ── */}
        <div className="space-y-4">
          <Card>
            <h3 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-4">
              Información
            </h3>
            <div className="space-y-4">
              <InfoRow
                icon={<Building2 className="w-3.5 h-3.5" />}
                label="Proveedor"
                value={purchase.supplier?.name ?? '—'}
              />
              {purchase.supplier?.cuit && (
                <InfoRow
                  icon={<Hash className="w-3.5 h-3.5" />}
                  label="CUIT proveedor"
                  value={<span className="font-mono">{formatCuit(purchase.supplier.cuit)}</span>}
                />
              )}
              <InfoRow
                icon={<Calendar className="w-3.5 h-3.5" />}
                label="Fecha"
                value={formatDate(purchase.date)}
              />
              <InfoRow
                icon={<Banknote className="w-3.5 h-3.5" />}
                label="Moneda"
                value={
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    purchase.currency === 'ARS'
                      ? 'text-gray-600 bg-gray-100 border-gray-200'
                      : 'text-amber-700 bg-amber-50 border-amber-200'
                  }`}>
                    {purchase.currency}
                  </span>
                }
              />
              {purchase.warehouseId && (
                <InfoRow
                  icon={<Warehouse className="w-3.5 h-3.5" />}
                  label="Stock actualizado"
                  value={
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                      <Link2 className="w-3 h-3" />
                      Sí ({linkedCount} ítems)
                    </span>
                  }
                />
              )}
              {purchase.user && (
                <InfoRow
                  icon={<User className="w-3.5 h-3.5" />}
                  label="Registrado por"
                  value={<span className="text-gray-600">{purchase.user.name}</span>}
                />
              )}
            </div>
          </Card>

          {/* Payment summary */}
          {invoices.length > 0 && (
            <Card>
              <h3 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3">
                Estado de pago
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-500 dark:text-slate-400">
                  <span>Total compra</span>
                  <span className="tabular-nums font-medium">{formatCurrency(Number(purchase.total), purchase.currency)}</span>
                </div>
                <div className="flex justify-between text-gray-500 dark:text-slate-400">
                  <span>Total facturado</span>
                  <span className="tabular-nums font-medium">{formatCurrency(totalInvoiced, purchase.currency)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-100 dark:border-slate-700 pt-2 font-semibold">
                  <span className="text-gray-700 dark:text-slate-300">Pendiente de pago</span>
                  <span className={`tabular-nums ${pendingInvoices.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {formatCurrency(
                      pendingInvoices.reduce((s, i) => s + Number(i.amount), 0),
                      purchase.currency
                    )}
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>

      </div>

      <ConfirmDialog
        isOpen={!!cancelId}
        onClose={() => setCancelId(null)}
        onConfirm={handleCancel}
        title="Cancelar compra"
        message="¿Estás seguro de que deseas cancelar esta compra? Los movimientos de stock asociados serán revertidos."
        confirmText="Cancelar compra"
        isLoading={isCanceling}
      />

      <ConfirmDialog
        isOpen={!!deletingInv}
        onClose={() => setDeletingInv(null)}
        onConfirm={() => handleDeleteInvoice(deletingInv!)}
        title="Eliminar factura"
        message="¿Eliminar esta factura del proveedor?"
        confirmText="Eliminar"
        isLoading={false}
      />

      <AddPurchaseInvoiceModal
        isOpen={showInvModal}
        purchaseId={id!}
        currency={purchase.currency}
        existing={editingInv}
        onClose={() => { setShowInvModal(false); setEditingInv(null); }}
        onSave={handleSaveInvoice}
        isLoading={savingInv}
      />
    </div>
  );
}
