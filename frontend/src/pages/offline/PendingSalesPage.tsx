import { useCallback, useEffect, useState } from 'react';
import { CloudOff, CloudUpload, Trash2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { Button } from '../../components/ui';
import { formatCurrency } from '../../utils/formatters';
import { useOfflineStore } from '../../stores/offline.store';
import { discardSale, listSales, purgeSent } from '../../lib/offline/outbox';
import { replayOutbox, retrySale } from '../../lib/offline/replay';
import type { OutboxSale } from '../../lib/offline/db';

/**
 * Ventas cargadas sin conexion que todavia viven solo en esta maquina.
 *
 * Es la red de seguridad del modo offline: mientras algo figure aca, no llego
 * al servidor. Por eso la pagina es explicita y el descarte pide confirmacion.
 */
export default function PendingSalesPage() {
  const [sales, setSales] = useState<OutboxSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [toDiscard, setToDiscard] = useState<OutboxSale | null>(null);
  const [uploading, setUploading] = useState(false);
  const setPendingSales = useOfflineStore((s) => s.setPendingSales);
  const connection = useOfflineStore((s) => s.connection);

  const refresh = useCallback(async () => {
    const rows = await listSales();
    setSales(rows);
    setPendingSales(rows.filter((r) => r.status !== 'SENT').length);
    setLoading(false);
  }, [setPendingSales]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleDiscard = async () => {
    if (!toDiscard) return;
    await discardSale(toDiscard.clientUuid);
    toast.success('Venta descartada y stock devuelto');
    setToDiscard(null);
    void refresh();
  };

  const handleUploadAll = async () => {
    setUploading(true);
    try {
      const r = await replayOutbox();
      if (r.stoppedForNetwork) {
        toast.error('Se cortó la conexión: las ventas restantes quedan pendientes');
      } else if (r.uploaded > 0) {
        toast.success(`${r.uploaded} venta${r.uploaded === 1 ? '' : 's'} subida${r.uploaded === 1 ? '' : 's'}`);
      } else if (r.failed > 0) {
        toast.error('Ninguna venta pudo subirse. Mirá el detalle del error.');
      } else {
        toast('No había nada para subir');
      }
    } finally {
      setUploading(false);
      void refresh();
    }
  };

  const handleRetry = async (clientUuid: string) => {
    setUploading(true);
    try {
      const ok = await retrySale(clientUuid);
      if (ok) toast.success('Venta subida');
      else toast.error('No se pudo subir. Mirá el detalle del error.');
    } finally {
      setUploading(false);
      void refresh();
    }
  };

  const handlePurge = async () => {
    const n = await purgeSent();
    toast.success(n > 0 ? `${n} venta(s) subida(s) quitadas de la lista` : 'No hay nada para limpiar');
    void refresh();
  };

  const pending = sales.filter((s) => s.status !== 'SENT');
  const sent = sales.filter((s) => s.status === 'SENT');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ventas pendientes de subir"
        subtitle="Comprobantes cargados sin conexión que todavía no llegaron al servidor"
        actions={
          pending.length > 0 && connection === 'online' ? (
            <Button onClick={handleUploadAll} isLoading={uploading}>
              <CloudUpload size={16} />
              Subir {pending.length === 1 ? 'la venta' : `las ${pending.length}`}
            </Button>
          ) : undefined
        }
      />

      {!loading && pending.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-800">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="mt-3 text-sm font-medium text-gray-900 dark:text-slate-100">
            No hay ventas pendientes
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Todo lo cargado en esta terminal ya está en el servidor.
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/50 dark:bg-amber-950/30">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-500" />
            <div className="text-sm text-amber-900 dark:text-amber-200">
              <p className="font-medium">
                {pending.length} venta{pending.length === 1 ? '' : 's'} existe
                {pending.length === 1 ? '' : 'n'} solo en esta computadora.
              </p>
              <p className="mt-1">
                No cierres sesión ni borres los datos del navegador hasta que
                suban. Los números <code className="font-mono text-xs">OFF-…</code>{' '}
                son provisionales: el definitivo lo asigna el servidor.
              </p>
            </div>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-slate-700 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Número provisional</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Cargada</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {pending.map((s) => (
                <tr key={s.clientUuid}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-900 dark:text-slate-100">
                    {s.provisionalNumber}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-slate-300">
                    {s.customerName ?? <span className="text-gray-400">Sin cliente</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500 dark:text-slate-400">
                    {new Date(s.createdAt).toLocaleString('es-AR')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-900 dark:text-slate-100">
                    {formatCurrency(Number(s.total), 'ARS')}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge sale={s} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {connection === 'online' && (
                        <button
                          type="button"
                          onClick={() => void handleRetry(s.clientUuid)}
                          disabled={uploading}
                          title="Subir esta venta"
                          className="rounded-md p-1.5 text-gray-400 hover:bg-primary-50 hover:text-primary-600 disabled:opacity-40 dark:hover:bg-primary-950/40"
                        >
                          <CloudUpload size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setToDiscard(s)}
                        title="Descartar y devolver el stock"
                        className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sent.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800">
          <span className="text-gray-600 dark:text-slate-400">
            {sent.length} venta{sent.length === 1 ? '' : 's'} ya subida
            {sent.length === 1 ? '' : 's'} al servidor.
          </span>
          <Button variant="secondary" onClick={handlePurge}>
            Limpiar
          </Button>
        </div>
      )}

      {connection === 'offline' && (
        <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
          <CloudOff size={15} />
          Sin conexión: las ventas suben solas cuando vuelva.
        </p>
      )}

      <ConfirmDialog
        isOpen={toDiscard !== null}
        onClose={() => setToDiscard(null)}
        onConfirm={handleDiscard}
        title="¿Descartar esta venta?"
        message={
          toDiscard
            ? `${toDiscard.provisionalNumber} se va a borrar de esta computadora y el stock descontado vuelve atrás. No existe en el servidor, así que no se puede recuperar.`
            : ''
        }
        confirmLabel="Descartar"
        variant="danger"
      />
    </div>
  );
}

function StatusBadge({ sale }: { sale: OutboxSale }) {
  if (sale.status === 'FAILED') {
    return (
      <span
        title={sale.lastError ?? undefined}
        className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
      >
        <AlertTriangle size={12} />
        Falló ({sale.attempts})
      </span>
    );
  }
  if (sale.status === 'SENDING') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
        <Clock size={12} />
        Subiendo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
      <Clock size={12} />
      Pendiente
    </span>
  );
}
