import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Truck, Warehouse as WarehouseIcon, Calendar, CheckCircle2, XCircle, FileText, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Button } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { purchaseRemitosService } from '../../services';
import { formatDate, formatCurrency } from '../../utils/formatters';
import type { PurchaseRemito, PurchaseRemitoStatus } from '../../types';

const STATUS_CFG: Record<PurchaseRemitoStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  RECEIVED:  { label: 'Recibido',  className: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  INVOICED:  { label: 'Facturado', className: 'text-indigo-700 bg-indigo-50 border-indigo-200',    icon: FileText },
  CANCELLED: { label: 'Cancelado', className: 'text-red-600 bg-red-50 border-red-200',             icon: XCircle },
};

export default function PurchaseRemitoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [remito, setRemito] = useState<PurchaseRemito | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancel, setShowCancel] = useState(false);
  const [acting, setActing] = useState(false);

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

  const handleCancel = async () => {
    if (!id) return;
    setActing(true);
    try {
      await purchaseRemitosService.cancel(id);
      toast.success('Remito cancelado — stock revertido');
      setShowCancel(false);
      fetchData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al cancelar');
    } finally {
      setActing(false);
    }
  };

  const handleInvoice = () => {
    if (!remito) return;
    navigate('/purchase-invoices', {
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
  const total = remito.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Remito ${remito.number}`}
        subtitle={`Recibido el ${formatDate(remito.date)}`}
        backTo="/purchase-remitos"
        actions={
          remito.status === 'RECEIVED' && (
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

      {/* Identity bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.className}`}>
          <StatusIcon className="w-3.5 h-3.5" /> {cfg.label}
        </span>
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
            <Package className="w-4 h-4 text-gray-400" /> Mercadería recibida
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
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums">{it.quantity}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums">{formatCurrency(it.unitPrice, 'ARS')}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums">{formatCurrency(it.quantity * it.unitPrice, 'ARS')}</td>
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
