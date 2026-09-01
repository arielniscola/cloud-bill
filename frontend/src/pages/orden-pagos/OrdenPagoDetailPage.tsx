import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Printer, XCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, Card } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { ordenPagosService } from '../../services';
import { formatCurrency, formatDate, formatCuit } from '../../utils/formatters';
import { PAYMENT_METHODS, RETENTION_TYPE_OPTIONS, RETENTION_BASE_OPTIONS } from '../../utils/constants';
import type { OrdenPago } from '../../types/ordenPago.types';

const RETENTION_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  RETENTION_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);
const RETENTION_BASE_LABELS: Record<string, string> = Object.fromEntries(
  RETENTION_BASE_OPTIONS.map((o) => [o.value, o.label]),
);

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagado',
};

function SkeletonDetail() {
  return (
    <div className="space-y-6 animate-pulse">
      <Card><div className="h-24 bg-gray-100 dark:bg-slate-700 rounded" /></Card>
      <Card><div className="h-40 bg-gray-100 dark:bg-slate-700 rounded" /></Card>
    </div>
  );
}

export default function OrdenPagoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [op, setOp]           = useState<OrdenPago | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    ordenPagosService.getById(id)
      .then(setOp)
      .catch(() => toast.error('Error al cargar la orden de pago'))
      .finally(() => setIsLoading(false));
  }, [id]);

  // `?print=1`: se llega desde el listado con la intención de imprimir. Se
  // espera a tener la orden cargada, si no se imprimiría el esqueleto.
  useEffect(() => {
    if (!op || searchParams.get('print') !== '1') return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('print');
      return next;
    }, { replace: true });
    const t = setTimeout(() => window.print(), 100);
    return () => clearTimeout(t);
  }, [op]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePay = async () => {
    if (!op) return;
    setIsPaying(true);
    try {
      const updated = await ordenPagosService.pay(op.id);
      setOp(updated);
      toast.success('Orden de pago marcada como pagada');
      setPayOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al procesar el pago');
    } finally {
      setIsPaying(false);
    }
  };

  const handleCancel = async () => {
    if (!op) return;
    setIsCancelling(true);
    try {
      const updated = await ordenPagosService.cancel(op.id);
      setOp((prev) => prev ? { ...prev, status: updated.status } : prev);
      toast.success('Orden de pago cancelada');
      setCancelOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al cancelar');
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading) return <SkeletonDetail />;
  if (!op) return (
    <div className="text-center py-20 text-gray-400">
      <p>Orden de pago no encontrada.</p>
      <button onClick={() => navigate('/orden-pagos')} className="mt-3 text-indigo-600 hover:underline text-sm">
        Volver al listado
      </button>
    </div>
  );

  const isCancelled = op.status === 'CANCELLED';
  const isPaid = op.status === 'PAID';
  const isEmitted = op.status === 'EMITTED';

  return (
    <div>
      <PageHeader
        title={`Orden de Pago ${op.number}`}
        subtitle={op.supplier?.name}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/orden-pagos')}>
              <ChevronLeft className="w-4 h-4 mr-1" />Volver
            </Button>
            {!isCancelled && (
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-2" />Imprimir
              </Button>
            )}
            {isEmitted && (
              <Button onClick={() => setPayOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <CheckCircle className="w-4 h-4 mr-2" />Marcar como Pagada
              </Button>
            )}
            {!isCancelled && (
              <Button variant="outline" onClick={() => setCancelOpen(true)} className="text-red-600 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                <XCircle className="w-4 h-4 mr-2" />Cancelar
              </Button>
            )}
          </div>
        }
      />

      {isCancelled && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 mb-6 text-red-700 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm font-medium">Esta orden de pago fue cancelada. Los movimientos aplicados han sido revertidos.</p>
        </div>
      )}
      {isEmitted && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 mb-6 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm font-medium">Orden emitida pendiente de pago. Los movimientos de cuentas se registrarán al marcarla como Pagada.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header card */}
          <Card>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Número</p>
                <p className="text-sm font-mono font-semibold text-indigo-600 dark:text-indigo-400">{op.number}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Fecha</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(op.date)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Estado</p>
                <Badge variant={isCancelled ? 'error' : isPaid ? 'success' : 'warning'} dot>
                  {isCancelled ? 'Cancelada' : isPaid ? 'Pagada' : 'Emitida'}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Proveedor</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{op.supplier?.name ?? '—'}</p>
                {op.supplier?.cuit && <p className="text-xs text-gray-400 dark:text-slate-500">CUIT: {formatCuit(op.supplier.cuit)}</p>}
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Método de pago</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{PAYMENT_METHODS[op.paymentMethod] ?? op.paymentMethod}</p>
              </div>
              {op.cashRegister && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Caja</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{op.cashRegister.name}</p>
                </div>
              )}
              {op.reference && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Referencia</p>
                  <p className="text-sm text-gray-700 dark:text-slate-300">{op.reference}</p>
                </div>
              )}
              {op.bank && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Banco</p>
                  <p className="text-sm text-gray-700 dark:text-slate-300">{op.bank}</p>
                </div>
              )}
              {op.checkDueDate && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Venc. cheque</p>
                  <p className="text-sm text-gray-700 dark:text-slate-300">{formatDate(op.checkDueDate)}</p>
                </div>
              )}
            </div>
            {op.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                <p className="text-xs text-gray-400 dark:text-slate-500 mb-1">Notas</p>
                <p className="text-sm text-gray-700 dark:text-slate-300">{op.notes}</p>
              </div>
            )}
          </Card>

          {/* Invoices paid */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">Facturas pagadas</h3>
            {(op.items?.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/40 dark:bg-indigo-900/10 px-4 py-3 text-sm text-indigo-700 dark:text-indigo-300">
                Pago a cuenta — sin facturas imputadas. Queda como saldo a favor en la cuenta corriente del proveedor.
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50/80 dark:bg-slate-700/50">
                  <tr>
                    {['Factura', 'Compra', 'Total factura', 'Monto aplicado'].map((h) => (
                      <th key={h} className={`px-4 py-2 text-xs font-semibold text-gray-400 uppercase ${h.startsWith('Monto') || h.startsWith('Total') ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {(op.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2.5">
                        {item.invoice ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-semibold text-gray-800 dark:text-slate-200">{item.invoice.number}</span>
                            <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800 px-1 py-0.5 rounded-full">
                              {item.invoice.type.replace('FACTURA_', 'F').replace('NOTA_DEBITO_', 'ND ').replace('NOTA_CREDITO_', 'NC ')}
                            </span>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => item.purchaseId && navigate(`/purchases/${item.purchaseId}`)}
                          className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          {item.purchase?.number ?? '—'}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                        {item.invoice ? formatCurrency(Number(item.invoice.amount), op.currency) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(Number(item.amount), op.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </Card>

          {/* Ajustes (descuentos / intereses) */}
          {(op.ajustes?.length ?? 0) > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">Ajustes</h3>
              <div className="space-y-1.5">
                {op.ajustes!.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${a.type === 'SUMA' ? 'text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300' : 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300'}`}>
                      {a.type === 'SUMA' ? 'Interés' : 'Descuento'}
                    </span>
                    {a.accountCode && <span className="font-mono text-xs text-gray-400">{a.accountCode}</span>}
                    <span className="text-sm text-gray-700 dark:text-slate-300 truncate">{a.description}</span>
                    <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white ml-auto">
                      {a.type === 'SUMA' ? '+' : '−'} {formatCurrency(Number(a.amount), op.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Retenciones practicadas */}
          {(op.retenciones?.length ?? 0) > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Retenciones</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
                Descontadas del pago. La deuda con el proveedor se cancela igual por el total: lo retenido
                queda como impuesto a depositar.
              </p>
              <div className="space-y-1.5">
                {op.retenciones!.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-violet-700 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-300">
                      {RETENTION_TYPE_LABELS[r.type] ?? r.type}
                    </span>
                    {r.jurisdiction && <span className="text-xs text-gray-500 dark:text-slate-400">{r.jurisdiction}</span>}
                    <span className="text-xs text-gray-500 dark:text-slate-400 tabular-nums">
                      {formatCurrency(Number(r.baseAmount), op.currency)} s/{RETENTION_BASE_LABELS[r.base] ?? r.base} × {r.percentage}%
                    </span>
                    {r.certificate && <span className="font-mono text-[11px] text-gray-400">{r.certificate}</span>}
                    <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white ml-auto">
                      − {formatCurrency(Number(r.amount), op.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Cheques de la orden */}
          {(op.cheques?.length ?? 0) > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">Cheques</h3>
              <div className="space-y-1.5">
                {op.cheques!.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${c.type === 'EGRESO' ? 'text-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-300' : 'text-purple-700 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-300'}`}>
                      {c.type === 'EGRESO' ? 'Propio' : 'Endosado'}
                    </span>
                    <span className="font-mono text-xs font-semibold text-gray-800 dark:text-slate-200">{c.checkNumber ?? c.number}</span>
                    <span className="text-xs text-gray-500 dark:text-slate-400">{c.bank ?? '—'}</span>
                    <span className="text-xs text-gray-400 ml-auto tabular-nums">{c.dueDate ? `Vto ${formatDate(c.dueDate)}` : 'Sin vto'}</span>
                    <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white w-28 text-right">
                      {formatCurrency(Number(c.amount), op.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Total sidebar */}
        <div className="space-y-4">
          <Card>
            {Number(op.retentionAmount) > 0 && (
              <div className="mb-3 pb-3 border-b border-dashed border-gray-200 dark:border-slate-700 space-y-0.5">
                <p className="text-xs text-gray-500 dark:text-slate-400 tabular-nums">
                  Cancelado al proveedor: {formatCurrency(Number(op.amount), op.currency)}
                </p>
                <p className="text-xs text-violet-600 dark:text-violet-400 tabular-nums">
                  − Retenciones: {formatCurrency(Number(op.retentionAmount), op.currency)}
                </p>
              </div>
            )}
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-1">
              {Number(op.retentionAmount) > 0 ? 'Neto pagado' : 'Total pagado'}
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
              {formatCurrency(Number(op.amount) - Number(op.retentionAmount ?? 0), op.currency)}
            </p>
            {op.currency === 'USD' && Number(op.exchangeRate) > 1 && (
              <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 tabular-nums mt-1">
                ≈ {formatCurrency((Number(op.amount) - Number(op.retentionAmount ?? 0)) * Number(op.exchangeRate), 'ARS')} · cotiz. {Number(op.exchangeRate).toLocaleString('es-AR')}
              </p>
            )}
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">{op.currency === 'USD' ? 'Dólares' : 'Pesos argentinos'}</p>
          </Card>

          <Card>
            <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">Info. adicional</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Emitido por</span>
                <span className="font-medium text-gray-900 dark:text-white">{op.user?.name ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Facturas</span>
                <span className="font-medium text-gray-900 dark:text-white">{op.items?.length ?? 0}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        isOpen={payOpen}
        onClose={() => setPayOpen(false)}
        onConfirm={handlePay}
        title="Confirmar Pago"
        message="Al marcar como Pagada se registrarán los movimientos en las cuentas del proveedor y se actualizará el estado de las facturas. ¿Confirmar?"
        confirmText="Marcar como Pagada"
        isLoading={isPaying}
      />

      <ConfirmDialog
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        title="Cancelar Orden de Pago"
        message="¿Estás seguro? Si la orden ya fue pagada, se revertirán los movimientos en las cuentas del proveedor y el estado de las facturas."
        confirmText="Cancelar orden"
        isLoading={isCancelling}
      />
    </div>
  );
}
