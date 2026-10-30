import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Truck, Warehouse as WarehouseIcon, Calendar, CheckCircle2, XCircle, FileText, Package, Pencil, Check, X, Clock, Ban, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Button, Modal, Textarea } from '../../components/ui';
import { PageHeader, ConfirmDialog, DocumentHistory } from '../../components/shared';
import { purchaseRemitosService } from '../../services';
import { formatDate, formatCurrency } from '../../utils/formatters';
import type { PurchaseRemito, PurchaseRemitoStatus } from '../../types';
import { approvalOutcome } from '../../utils/approvalActions';
import PendingApprovalBanner from '../../components/approvals/PendingApprovalBanner';
import { usePermissions } from '../../hooks/usePermissions';

const STATUS_CFG: Record<PurchaseRemitoStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  RECEIVED:  { label: 'Recibido',  className: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  INVOICED:  { label: 'Facturado', className: 'text-indigo-700 bg-indigo-50 border-indigo-200',    icon: FileText },
  CANCELLED: { label: 'Cancelado', className: 'text-red-600 bg-red-50 border-red-200',             icon: XCircle },
  PENDING_CONFIRMATION: { label: 'Pendiente de confirmación', className: 'text-amber-700 bg-amber-50 border-amber-200', icon: Clock },
  REJECTED:  { label: 'Rechazado', className: 'text-gray-600 bg-gray-100 border-gray-200',         icon: Ban },
};

/** Línea editable al confirmar una recepción de depósito. */
interface DraftLine { quantity: string; lotNumber: string; expiresAt: string }

const fmtDay = (d: string) => d.split('-').reverse().join('/');

export default function PurchaseRemitoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [remito, setRemito] = useState<PurchaseRemito | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancel, setShowCancel] = useState(false);
  const [acting, setActing] = useState(false);
  const [editingNumber, setEditingNumber] = useState(false);
  const [numberInput, setNumberInput] = useState('');
  const [savingNumber, setSavingNumber] = useState(false);
  const { isAdmin, isSuperAdmin, canWritePurchases, isWarehouseClerk } = usePermissions();
  const canConfirm = isAdmin || isSuperAdmin;
  // Correcciones del admin sobre lo que cargó depósito, por id de línea.
  const [draft, setDraft] = useState<Record<string, DraftLine>>({});
  const [confirming, setConfirming] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const fetchData = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      setRemito(await purchaseRemitosService.getById(id));
    } catch {
      toast.error('No se pudo cargar el remito');
      navigate('/purchase-remitos');
    } finally {
      setIsLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Al abrir una recepción pendiente, el borrador arranca con lo que cargó depósito.
  useEffect(() => {
    if (remito?.status !== 'PENDING_CONFIRMATION') return;
    setDraft(Object.fromEntries(remito.items.map((i) => [i.id, {
      quantity: String(Number(i.quantity)),
      lotNumber: i.lotNumber ?? '',
      expiresAt: i.expiresAt ?? '',
    }])));
  }, [remito]);

  const setLine = (lineId: string, patch: Partial<DraftLine>) =>
    setDraft((prev) => ({ ...prev, [lineId]: { ...prev[lineId], ...patch } }));

  const handleConfirm = async () => {
    if (!id || !remito) return;
    const items = remito.items.map((i) => ({
      id: i.id,
      quantity: Number((draft[i.id]?.quantity ?? '0').replace(',', '.')),
      lotNumber: draft[i.id]?.lotNumber.trim() || null,
      expiresAt: draft[i.id]?.expiresAt || null,
    }));
    if (items.some((i) => !Number.isFinite(i.quantity) || i.quantity < 0)) { toast.error('Revisá las cantidades'); return; }
    if (!items.some((i) => i.quantity > 0)) { toast.error('No llegó nada: rechazá la recepción'); return; }
    setConfirming(true);
    try {
      await purchaseRemitosService.confirm(id, items);
      toast.success('Recepción confirmada — la mercadería entró al stock');
      fetchData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al confirmar');
    } finally {
      setConfirming(false);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    if (rejectReason.trim().length < 3) { toast.error('Indicá el motivo del rechazo'); return; }
    setActing(true);
    try {
      await purchaseRemitosService.reject(id, rejectReason.trim());
      toast.success('Recepción rechazada');
      setShowReject(false);
      setRejectReason('');
      fetchData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al rechazar');
    } finally {
      setActing(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    setActing(true);
    try {
      await purchaseRemitosService.cancel(id);
      toast.success('Remito cancelado — stock revertido');
      setShowCancel(false);
      fetchData();
    } catch (e: unknown) {
      if (approvalOutcome(e)) { setShowCancel(false); return; }
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al cancelar');
    } finally {
      setActing(false);
    }
  };

  const startEditNumber = () => {
    if (!remito) return;
    setNumberInput(remito.number);
    setEditingNumber(true);
  };

  const handleSaveNumber = async () => {
    if (!id) return;
    const trimmed = numberInput.trim();
    if (!trimmed) { toast.error('Ingresá un número válido'); return; }
    setSavingNumber(true);
    try {
      await purchaseRemitosService.updateNumber(id, trimmed);
      toast.success('Número actualizado');
      setEditingNumber(false);
      fetchData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al actualizar el número');
    } finally {
      setSavingNumber(false);
    }
  };

  const handleInvoice = () => {
    if (!remito) return;
    navigate('/purchase-invoices/new', {
      state: {
        fromRemito: {
          remitoId:     remito.id,
          remitoNumber: remito.number,
          supplierId:   remito.supplierId,
          supplierName: remito.supplier?.name,
          currency:     'ARS',
          items: remito.items.map((i) => ({
            description: i.description,
            quantity:    i.quantity,
            unitPrice:   i.unitPrice,
            taxRate:     21,
            productId:   i.productId,
          })),
        },
      },
    });
  };

  if (isLoading || !remito) {
    return (
      <div>
        <PageHeader title="Remito de compra" backTo="/purchase-remitos" />
        <Card><p className="py-10 text-center text-gray-400">Cargando…</p></Card>
      </div>
    );
  }

  const cfg = STATUS_CFG[remito.status];
  const StatusIcon = cfg.icon;
  const isPending = remito.status === 'PENDING_CONFIRMATION';
  const editing = isPending && canConfirm;
  const qtyOf = (lineId: string, fallback: number) =>
    editing ? Number((draft[lineId]?.quantity ?? '0').replace(',', '.')) || 0 : Number(fallback);
  const total = remito.items.reduce((s, i) => s + qtyOf(i.id, i.quantity) * i.unitPrice, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Remito ${remito.number}`}
        subtitle={`${isPending || remito.status === 'REJECTED' ? 'Cargado' : 'Recibido'} el ${formatDate(remito.date)}`}
        backTo="/purchase-remitos"
        actions={
          editing ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleConfirm} isLoading={confirming}>
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Confirmar recepción
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowReject(true)}
                className="text-red-600 border-red-200 hover:bg-red-50">
                <Ban className="w-3.5 h-3.5 mr-1.5" /> Rechazar
              </Button>
            </div>
          ) : remito.status === 'RECEIVED' && canWritePurchases && (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleInvoice}>
                <FileText className="w-3.5 h-3.5 mr-1.5" /> Facturar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowCancel(true)}
                className="text-red-600 border-red-200 hover:bg-red-50">
                <XCircle className="w-3.5 h-3.5 mr-1.5" /> Cancelar
              </Button>
            </div>
          )
        }
      />
      <PendingApprovalBanner entityType="PURCHASE_REMITO" entityId={id} />

      {isPending && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              Pendiente de confirmación{remito.user?.name ? ` — la cargó ${remito.user.name}` : ''}
            </p>
            <p className="mt-0.5">
              {editing
                ? 'El stock todavía no entró. Revisá lo recibido, corregí cantidad, lote o vencimiento si hace falta y confirmá: recién ahí entra la mercadería.'
                : 'El stock todavía no entró: un administrador tiene que confirmar la recepción.'}
            </p>
          </div>
        </div>
      )}
      {remito.status === 'REJECTED' && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              Recepción rechazada{remito.rejectedBy?.name ? ` por ${remito.rejectedBy.name}` : ''}
              {remito.rejectedAt ? ` el ${formatDate(remito.rejectedAt)}` : ''}
            </p>
            {remito.rejectionReason && <p className="mt-0.5">Motivo: {remito.rejectionReason}</p>}
            <p className="mt-0.5 text-xs opacity-80">No entró nada al stock.</p>
          </div>
        </div>
      )}
      {remito.confirmedAt && (
        <p className="flex items-center gap-1.5 px-1 text-xs text-gray-500 dark:text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          Cargada por {remito.user?.name ?? 'depósito'} · confirmada por {remito.confirmedBy?.name ?? 'un administrador'} el {formatDate(remito.confirmedAt)}
        </p>
      )}

      {/* Identity bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.className}`}>
          <StatusIcon className="w-3.5 h-3.5" /> {cfg.label}
        </span>
        {editingNumber ? (
          <span className="flex items-center gap-1.5">
            <input
              autoFocus
              value={numberInput}
              onChange={(e) => setNumberInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNumber(); if (e.key === 'Escape') setEditingNumber(false); }}
              className="text-sm font-mono px-2 py-1 rounded-md border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-700 text-gray-900 dark:text-white w-36"
            />
            <button onClick={handleSaveNumber} disabled={savingNumber}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => setEditingNumber(false)} disabled={savingNumber}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500">
              <X className="w-4 h-4" />
            </button>
          </span>
        ) : (
          <span className="flex items-center gap-1 text-gray-500 dark:text-slate-400">
            <span className="font-mono text-sm">{remito.number}</span>
            {remito.status !== 'CANCELLED' && remito.status !== 'REJECTED' && !isWarehouseClerk && (
              <button onClick={startEditNumber} title="Editar número"
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600">
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-gray-600 dark:text-slate-300">
          <Truck className="w-3.5 h-3.5 text-gray-400" /> {remito.supplier?.name ?? '—'}
        </span>
        <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400">
          <WarehouseIcon className="w-3.5 h-3.5 text-gray-400" /> {remito.warehouse?.name ?? '—'}
        </span>
        <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400">
          <Calendar className="w-3.5 h-3.5 text-gray-400" /> {formatDate(remito.date)}
        </span>
        {remito.status === 'INVOICED' && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
            <FileText className="w-3.5 h-3.5" /> Facturado
          </span>
        )}
      </div>

      {/* Items */}
      <Card className="overflow-hidden p-0">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-400" /> {editing ? 'Mercadería recibida — revisar y confirmar' : 'Mercadería recibida'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700">
              <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-2.5">Descripción</th>
                <th className="px-4 py-2.5 text-right">Cant.</th>
                <th className="px-4 py-2.5 text-right">Costo unit.</th>
                <th className="px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {remito.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300">
                    {it.description}
                    {it.productName && <span className="text-xs text-gray-400 ml-1.5">({it.productName})</span>}
                    {editing && it.productId ? (
                      <span className="mt-1.5 flex flex-wrap gap-2">
                        <input
                          value={draft[it.id]?.lotNumber ?? ''}
                          onChange={(e) => setLine(it.id, { lotNumber: e.target.value })}
                          placeholder="Lote"
                          aria-label={`Lote de ${it.description}`}
                          className="w-32 rounded-md border border-gray-200 bg-white px-2 py-1 font-mono text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                        />
                        <input
                          type="date"
                          value={draft[it.id]?.expiresAt ?? ''}
                          onChange={(e) => setLine(it.id, { expiresAt: e.target.value })}
                          aria-label={`Vencimiento de ${it.description}`}
                          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                        />
                      </span>
                    ) : it.lotNumber && (
                      <span className="block text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                        Lote <span className="font-mono">{it.lotNumber}</span>
                        {it.expiresAt && <> · vence {fmtDay(it.expiresAt)}</>}
                      </span>
                    )}
                    {/* Ya confirmada: lo que había cargado depósito, si el admin lo corrigió. */}
                    {!editing && it.receivedQuantity != null && (
                      Number(it.receivedQuantity) !== Number(it.quantity) ||
                      (it.receivedLotNumber ?? null) !== (it.lotNumber ?? null) ||
                      (it.receivedExpiresAt ?? null) !== (it.expiresAt ?? null)
                    ) && (
                      <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-300">
                        Depósito había cargado: {Number(it.receivedQuantity)}
                        {it.receivedLotNumber && <> · lote <span className="font-mono">{it.receivedLotNumber}</span></>}
                        {it.receivedExpiresAt && <> · vence {fmtDay(it.receivedExpiresAt)}</>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums">
                    {editing ? (
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={draft[it.id]?.quantity ?? ''}
                        onChange={(e) => setLine(it.id, { quantity: e.target.value })}
                        aria-label={`Cantidad de ${it.description}`}
                        className="w-24 rounded-md border border-gray-200 bg-white px-2 py-1 text-right text-sm tabular-nums dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                      />
                    ) : Number(it.quantity)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums">{formatCurrency(it.unitPrice, 'ARS')}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums">{formatCurrency(qtyOf(it.id, it.quantity) * it.unitPrice, 'ARS')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-gray-100 dark:border-slate-700">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-right text-sm text-gray-500">Valorización</td>
                <td className="px-4 py-3 text-right text-base font-bold text-indigo-600 tabular-nums">{formatCurrency(total, 'ARS')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {remito.notes && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-700 text-sm text-gray-500 dark:text-slate-400">
            <span className="font-medium text-gray-600 dark:text-slate-300">Notas: </span>{remito.notes}
          </div>
        )}
      </Card>

      <DocumentHistory
        entityId={remito.id}
        reloadKey={remito.status}
        created={{ date: remito.createdAt, user: remito.user?.name, title: `Remito de compra ${remito.number} cargado` }}
        final={remito.status === 'PENDING_CONFIRMATION' ? [{ title: 'Pendiente de confirmación: el stock todavía no entró', tone: 'pending' }] : []}
      />

      <Modal isOpen={showReject} onClose={() => setShowReject(false)} title="Rechazar recepción" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-slate-300">
            No entra nada al stock. Quien la cargó ve el motivo y, si corresponde, la vuelve a cargar.
          </p>
          <Textarea
            label="Motivo"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ej.: la mercadería no corresponde a este proveedor"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowReject(false)}>Volver</Button>
            <Button variant="danger" onClick={handleReject} isLoading={acting} disabled={rejectReason.trim().length < 3}>
              Rechazar recepción
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={handleCancel}
        isLoading={acting}
        title="Cancelar remito"
        message="Se revertirá el stock recibido de este remito. ¿Continuar?"
        confirmText="Cancelar remito"
      />
    </div>
  );
}
