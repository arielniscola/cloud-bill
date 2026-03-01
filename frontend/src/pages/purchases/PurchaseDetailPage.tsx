import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Building2, Calendar, Hash, Banknote,
  XCircle, FileText, Package, CheckCircle2,
  User, Link2, Warehouse,
} from 'lucide-react';
import { Card, Button } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { purchasesService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { INVOICE_TYPES } from '../../utils/constants';
import type { Purchase } from '../../types';

// ── Status config ────────────────────────────────────────────────
const STATUS_CFG = {
  REGISTERED: { label: 'Registrada', icon: CheckCircle2, className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  CANCELLED:  { label: 'Cancelada',  icon: XCircle,      className: 'text-red-600    bg-red-50    border-red-200'    },
} as const;

// ── Info row ─────────────────────────────────────────────────────
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-gray-400">
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-400 leading-none mb-0.5">{label}</p>
        <div className="text-sm font-medium text-gray-800">{value}</div>
      </div>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-10 bg-gray-100 rounded-xl w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="h-12 bg-gray-50 border-b border-gray-100" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 border-b border-gray-100 mx-5 my-2 bg-gray-100 rounded-lg" />
            ))}
            <div className="h-20 bg-gray-50/60 mx-0" />
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [purchase,   setPurchase]   = useState<Purchase | null>(null);
  const [isLoading,  setIsLoading]  = useState(true);
  const [cancelId,   setCancelId]   = useState<string | null>(null);
  const [isCanceling,setIsCanceling]= useState(false);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    purchasesService.getById(id)
      .then(setPurchase)
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

  if (isLoading) return (
    <div>
      <PageHeader title="Detalle de compra" backTo="/purchases" />
      <PageSkeleton />
    </div>
  );

  if (!purchase) return null;

  const statusCfg = STATUS_CFG[purchase.status];
  const StatusIcon = statusCfg.icon;
  const invoiceTypeLabel = INVOICE_TYPES[purchase.type as keyof typeof INVOICE_TYPES] ?? purchase.type;

  // Tax breakdown by rate
  const taxByRate = purchase.items.reduce<Record<string, number>>((acc, item) => {
    const rate = String(item.taxRate);
    acc[rate] = (acc[rate] ?? 0) + Number(item.taxAmount);
    return acc;
  }, {});
  const taxRates = Object.keys(taxByRate).map(Number).sort((a, b) => a - b);
  const hasMultipleRates = taxRates.length > 1;

  const linkedCount = purchase.items.filter((i) => i.productId).length;

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
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusCfg.className}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {statusCfg.label}
        </span>
        <span className="hidden sm:block w-px h-4 bg-gray-200" />
        <span className="flex items-center gap-1.5 text-gray-600">
          <Building2 className="w-3.5 h-3.5 text-gray-400" />
          {purchase.supplier?.name ?? '—'}
        </span>
        <span className="hidden sm:block w-px h-4 bg-gray-200" />
        <span className="flex items-center gap-1.5 text-gray-500">
          <Calendar className="w-3.5 h-3.5 text-gray-400" />
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

        {/* ── Left: items ── */}
        <div className="space-y-4">
          <Card padding="none">
            {/* Card header */}
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
              <Package className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700">
                Ítems
                <span className="ml-1.5 text-xs font-normal text-gray-400">· {purchase.items.length}</span>
              </h3>
            </div>

            {/* Column headers */}
            <div className="hidden md:grid grid-cols-[3fr_56px_108px_56px_108px] gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <span>Descripción</span>
              <span className="text-right">Cant.</span>
              <span className="text-right">Precio unit.</span>
              <span className="text-right">IVA</span>
              <span className="text-right">Total</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-50">
              {purchase.items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-1 md:grid-cols-[3fr_56px_108px_56px_108px] gap-3 px-5 py-3.5 items-center"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800 leading-tight">{item.description}</p>
                    {item.productId && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full">
                        <Link2 className="w-2.5 h-2.5" />
                        Vinculado a producto
                      </span>
                    )}
                  </div>
                  <div className="md:text-right">
                    <span className="text-xs text-gray-400 md:hidden">Cant. </span>
                    <span className="text-sm text-gray-700 tabular-nums">{item.quantity}</span>
                  </div>
                  <div className="md:text-right">
                    <span className="text-xs text-gray-400 md:hidden">Precio unit. </span>
                    <span className="text-sm text-gray-600 tabular-nums">{formatCurrency(Number(item.unitPrice), purchase.currency)}</span>
                  </div>
                  <div className="md:text-right">
                    <span className="text-xs text-gray-400 md:hidden">IVA </span>
                    <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{item.taxRate}%</span>
                  </div>
                  <div className="md:text-right">
                    <span className="text-xs text-gray-400 md:hidden">Total </span>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">{formatCurrency(Number(item.total), purchase.currency)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals footer */}
            <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/60 flex justify-end">
              <div className="space-y-2 text-sm w-60">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(Number(purchase.subtotal), purchase.currency)}</span>
                </div>

                {/* Tax breakdown */}
                {hasMultipleRates ? (
                  taxRates.map((rate) => (
                    <div key={rate} className="flex justify-between text-gray-400 text-xs">
                      <span>IVA {rate}%</span>
                      <span className="tabular-nums">{formatCurrency(taxByRate[String(rate)], purchase.currency)}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between text-gray-500">
                    <span>IVA{taxRates.length === 1 ? ` ${taxRates[0]}%` : ''}</span>
                    <span className="tabular-nums">{formatCurrency(Number(purchase.taxAmount), purchase.currency)}</span>
                  </div>
                )}

                <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2.5 text-gray-900">
                  <span>Total</span>
                  <span className="tabular-nums text-indigo-600">{formatCurrency(Number(purchase.total), purchase.currency)}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Notes */}
          {purchase.notes && (
            <Card>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-600">Notas</span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{purchase.notes}</p>
            </Card>
          )}
        </div>

        {/* ── Right: metadata ── */}
        <div className="space-y-4">
          <Card>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Información del comprobante
            </h3>
            <div className="space-y-4">
              <InfoRow
                icon={<Hash className="w-3.5 h-3.5" />}
                label="Número"
                value={<span className="font-mono text-sm">{purchase.number}</span>}
              />
              <InfoRow
                icon={<FileText className="w-3.5 h-3.5" />}
                label="Tipo"
                value={
                  <span className="text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                    {invoiceTypeLabel}
                  </span>
                }
              />
              <InfoRow
                icon={<Building2 className="w-3.5 h-3.5" />}
                label="Proveedor"
                value={purchase.supplier?.name ?? '—'}
              />
              {purchase.supplier?.cuit && (
                <InfoRow
                  icon={<Hash className="w-3.5 h-3.5" />}
                  label="CUIT proveedor"
                  value={<span className="font-mono">{purchase.supplier.cuit}</span>}
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
    </div>
  );
}
