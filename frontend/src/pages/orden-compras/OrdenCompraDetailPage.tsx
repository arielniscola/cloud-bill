import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Building2, Calendar, Banknote, Package, FileText,
  Pencil, Trash2, ChevronDown, Warehouse, CheckCircle2,
  ArrowRight, XCircle, Clock, Send,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { ordenComprasService, purchasesService } from '../../services';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { OrdenCompra, OrdenCompraStatus } from '../../types';

// ── Status config ──────────────────────────────────────────────────────────
const STATUS_CFG: Record<OrdenCompraStatus, { label: string; icon: React.ElementType; className: string }> = {
  DRAFT:     { label: 'Borrador',   icon: Clock,         className: 'text-gray-600  bg-gray-50   border-gray-200  dark:text-slate-300 dark:bg-slate-700  dark:border-slate-600' },
  SENT:      { label: 'Enviada',    icon: Send,          className: 'text-blue-700  bg-blue-50   border-blue-200  dark:text-blue-400  dark:bg-blue-900/30 dark:border-blue-800' },
  CONFIRMED: { label: 'Confirmada', icon: CheckCircle2,  className: 'text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-400 dark:bg-indigo-900/30 dark:border-indigo-800' },
  RECEIVED:  { label: 'Recibida',   icon: CheckCircle2,  className: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-800' },
  CANCELLED: { label: 'Cancelada',  icon: XCircle,       className: 'text-red-600   bg-red-50    border-red-200   dark:text-red-400   dark:bg-red-900/30  dark:border-red-800' },
};

// Next allowed statuses per current status
const NEXT_STATUSES: Partial<Record<OrdenCompraStatus, OrdenCompraStatus[]>> = {
  DRAFT:     ['SENT', 'CANCELLED'],
  SENT:      ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
};

// ── InfoRow ─────────────────────────────────────────────────────────────────
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

export default function OrdenCompraDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [oc, setOc] = useState<OrdenCompra | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!id) return;
    try {
      const data = await ordenComprasService.getById(id);
      setOc(data);
    } catch {
      toast.error('Error al cargar la orden de compra');
      navigate('/orden-compras');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close status dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleStatusChange = async (newStatus: OrdenCompraStatus) => {
    if (!oc) return;
    setIsUpdatingStatus(true);
    setShowStatusMenu(false);
    try {
      const updated = await ordenComprasService.updateStatus(oc.id, newStatus as Exclude<OrdenCompraStatus, 'RECEIVED'>);
      setOc(updated);
      toast.success(`Estado actualizado a ${STATUS_CFG[newStatus].label}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al actualizar estado');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleConvert = async () => {
    if (!oc) return;
    setIsConverting(true);
    try {
      const result = await ordenComprasService.convert(oc.id);
      toast.success('OC convertida a compra');
      navigate(`/purchases/${result.purchase.id}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al convertir');
    } finally {
      setIsConverting(false);
    }
  };

  const handleDelete = async () => {
    if (!oc) return;
    setIsDeleting(true);
    try {
      await ordenComprasService.delete(oc.id);
      toast.success('Orden de compra eliminada');
      navigate('/orden-compras');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al eliminar');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-5">
        <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-xl w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl h-64" />
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl h-64" />
        </div>
      </div>
    );
  }

  if (!oc) return null;

  const cfg = STATUS_CFG[oc.status];
  const StatusIcon = cfg.icon;
  const nextStatuses = NEXT_STATUSES[oc.status] ?? [];
  const canEdit = oc.status === 'DRAFT';
  const canConvert = oc.status === 'CONFIRMED';
  const canDelete = oc.status === 'DRAFT' || oc.status === 'CANCELLED';

  // Tax breakdown
  const taxByRate = (oc.items ?? []).reduce<Record<string, number>>((acc, item) => {
    const rate = String(item.taxRate);
    acc[rate] = (acc[rate] ?? 0) + Number(item.taxAmount);
    return acc;
  }, {});
  const taxRates = Object.keys(taxByRate).map(Number).sort((a, b) => a - b);
  const hasMultipleRates = taxRates.length > 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`OC ${oc.number}`}
        subtitle={`Creada el ${formatDate(oc.createdAt)}`}
        backTo="/orden-compras"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status dropdown */}
            {nextStatuses.length > 0 && (
              <div className="relative" ref={statusMenuRef}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowStatusMenu((v) => !v)}
                  isLoading={isUpdatingStatus}
                >
                  Cambiar estado
                  <ChevronDown className="w-3.5 h-3.5 ml-1" />
                </Button>
                {showStatusMenu && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-10 py-1">
                    {nextStatuses.map((s) => {
                      const scfg = STATUS_CFG[s];
                      const SIcon = scfg.icon;
                      return (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          <SIcon className="w-3.5 h-3.5 text-gray-400" />
                          {scfg.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Convert to purchase */}
            {canConvert && (
              <Button
                size="sm"
                onClick={handleConvert}
                isLoading={isConverting}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                Convertir a Compra
              </Button>
            )}

            {/* Edit */}
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/orden-compras/${oc.id}/edit`)}
              >
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Editar
              </Button>
            )}

            {/* Delete */}
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Eliminar
              </Button>
            )}
          </div>
        }
      />

      {/* Identity bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.className}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {cfg.label}
        </span>
        <span className="hidden sm:block w-px h-4 bg-gray-200 dark:bg-slate-600" />
        <span className="flex items-center gap-1.5 text-gray-600 dark:text-slate-300">
          <Building2 className="w-3.5 h-3.5 text-gray-400" />
          {oc.supplier?.name ?? '—'}
        </span>
        <span className="hidden sm:block w-px h-4 bg-gray-200 dark:bg-slate-600" />
        <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400">
          <Calendar className="w-3.5 h-3.5 text-gray-400" />
          {formatDate(oc.date)}
        </span>
        {oc.currency !== 'ARS' && (
          <>
            <span className="hidden sm:block w-px h-4 bg-gray-200" />
            <span className="text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
              {oc.currency}
            </span>
          </>
        )}
        {oc.purchaseId && (
          <>
            <span className="hidden sm:block w-px h-4 bg-gray-200" />
            <button
              onClick={() => navigate(`/purchases/${oc.purchaseId}`)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              Ver compra →
            </button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">

        {/* Left: items */}
        <div className="space-y-4">
          <Card padding="none">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <Package className="w-4 h-4 text-gray-400 dark:text-slate-500" />
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                Ítems
                <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-slate-500">· {(oc.items ?? []).length}</span>
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
              {(oc.items ?? []).map((item) => (
                <div key={item.id} className="grid grid-cols-1 md:grid-cols-[3fr_56px_108px_56px_108px] gap-3 px-5 py-3.5 items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-200 leading-tight">{item.description}</p>
                    {item.product && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full">
                        {item.product.name}
                      </span>
                    )}
                  </div>
                  <div className="md:text-right">
                    <span className="text-xs text-gray-400 md:hidden">Cant. </span>
                    <span className="text-sm text-gray-700 dark:text-slate-300 tabular-nums">{item.quantity}</span>
                  </div>
                  <div className="md:text-right">
                    <span className="text-xs text-gray-400 md:hidden">Precio unit. </span>
                    <span className="text-sm text-gray-600 dark:text-slate-400 tabular-nums">{formatCurrency(Number(item.unitPrice), oc.currency)}</span>
                  </div>
                  <div className="md:text-right">
                    <span className="text-xs text-gray-400 md:hidden">IVA </span>
                    <span className="text-xs font-semibold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">{item.taxRate}%</span>
                  </div>
                  <div className="md:text-right">
                    <span className="text-xs text-gray-400 md:hidden">Total </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{formatCurrency(Number(item.total), oc.currency)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals footer */}
            <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-700/30 flex justify-end">
              <div className="space-y-2 text-sm w-60">
                <div className="flex justify-between text-gray-500 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(Number(oc.subtotal), oc.currency)}</span>
                </div>
                {hasMultipleRates ? (
                  taxRates.map((rate) => (
                    <div key={rate} className="flex justify-between text-gray-400 dark:text-slate-500 text-xs">
                      <span>IVA {rate}%</span>
                      <span className="tabular-nums">{formatCurrency(taxByRate[String(rate)], oc.currency)}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between text-gray-500 dark:text-slate-400">
                    <span>IVA{taxRates.length === 1 ? ` ${taxRates[0]}%` : ''}</span>
                    <span className="tabular-nums">{formatCurrency(Number(oc.taxAmount), oc.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t border-gray-200 dark:border-slate-600 pt-2.5 text-gray-900 dark:text-white">
                  <span>Total</span>
                  <span className="tabular-nums text-indigo-600">{formatCurrency(Number(oc.total), oc.currency)}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Notes */}
          {oc.notes && (
            <Card>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                <span className="text-sm font-semibold text-gray-600 dark:text-slate-400">Notas</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">{oc.notes}</p>
            </Card>
          )}
        </div>

        {/* Right: metadata */}
        <div>
          <Card>
            <h3 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-4">
              Información
            </h3>
            <div className="space-y-4">
              <InfoRow
                icon={<Building2 className="w-3.5 h-3.5" />}
                label="Proveedor"
                value={oc.supplier?.name ?? '—'}
              />
              <InfoRow
                icon={<Calendar className="w-3.5 h-3.5" />}
                label="Fecha"
                value={formatDate(oc.date)}
              />
              {oc.expectedDate && (
                <InfoRow
                  icon={<Calendar className="w-3.5 h-3.5" />}
                  label="Entrega estimada"
                  value={formatDate(oc.expectedDate)}
                />
              )}
              <InfoRow
                icon={<Banknote className="w-3.5 h-3.5" />}
                label="Moneda"
                value={
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    oc.currency === 'ARS'
                      ? 'text-gray-600 bg-gray-100 border-gray-200'
                      : 'text-amber-700 bg-amber-50 border-amber-200'
                  }`}>
                    {oc.currency}
                  </span>
                }
              />
              {oc.currency !== 'ARS' && (
                <InfoRow
                  icon={<Banknote className="w-3.5 h-3.5" />}
                  label="Tipo de cambio"
                  value={`1 ${oc.currency} = $${Number(oc.exchangeRate).toLocaleString('es-AR')}`}
                />
              )}
              {oc.warehouse && (
                <InfoRow
                  icon={<Warehouse className="w-3.5 h-3.5" />}
                  label="Almacén destino"
                  value={oc.warehouse.name}
                />
              )}
              {oc.user && (
                <InfoRow
                  icon={<Building2 className="w-3.5 h-3.5" />}
                  label="Creado por"
                  value={oc.user.name}
                />
              )}
            </div>
          </Card>
        </div>

      </div>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Eliminar orden de compra"
        message="¿Estás seguro de que deseas eliminar esta OC? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
