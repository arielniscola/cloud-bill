import { useState } from 'react';
import { CheckCircle2, XCircle, MinusCircle, PauseCircle, Zap } from 'lucide-react';
import { Button, Modal, Spinner } from '../../components/ui';
import { invoicesService } from '../../services';
import { formatDate, formatInvoiceNumber } from '../../utils/formatters';
import type { ArcaBatchResult, Invoice } from '../../types';

/** ARCA acepta comprobantes de productos hasta 5 días hacia atrás. */
const ARCA_MAX_DAYS_BACK = 5;

function daysAgo(date: string): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86_400_000);
}

const OUTCOME_CFG: Record<ArcaBatchResult['outcome'], { label: string; icon: typeof CheckCircle2; cls: string }> = {
  AUTHORIZED:    { label: 'Autorizada',   icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400' },
  ERROR:         { label: 'Error',        icon: XCircle,      cls: 'text-red-600 dark:text-red-400' },
  SKIPPED:       { label: 'Salteada',     icon: MinusCircle,  cls: 'text-amber-600 dark:text-amber-400' },
  NOT_PROCESSED: { label: 'Sin procesar', icon: PauseCircle,  cls: 'text-gray-500 dark:text-slate-400' },
};

interface Props {
  isOpen: boolean;
  invoices: Invoice[];
  onClose: () => void;
  /** Se llama al terminar el lote (haya o no errores) para refrescar el listado. */
  onDone: () => void;
}

/**
 * Emisión en lote de facturas pendientes de CAE. El backend las emite una por
 * vez en orden de fecha y corta si ARCA deja de responder; acá se confirma,
 * se espera y se muestra qué pasó con cada una.
 */
export default function ArcaBatchModal({ isOpen, invoices, onClose, onDone }: Props) {
  const [phase, setPhase] = useState<'confirm' | 'running' | 'done'>('confirm');
  const [redate, setRedate] = useState(false);
  const [results, setResults] = useState<ArcaBatchResult[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);
  // El listado limpia la selección al terminar: el resultado se arma con la
  // copia tomada al lanzar el lote.
  const [snapshot, setSnapshot] = useState<Invoice[]>([]);

  const pastCount = invoices.filter((i) => daysAgo(i.date) > 0).length;
  const tooOldCount = invoices.filter((i) => daysAgo(i.date) > ARCA_MAX_DAYS_BACK).length;
  const byId = new Map(snapshot.map((i) => [i.id, i]));

  const close = () => {
    if (phase === 'running') return; // no se cancela a mitad: el backend sigue igual
    setPhase('confirm');
    setResults([]);
    setRequestError(null);
    setRedate(false);
    onClose();
  };

  const run = async () => {
    setSnapshot(invoices);
    setPhase('running');
    setRequestError(null);
    try {
      setResults(await invoicesService.emitBatch(invoices.map((i) => i.id), redate));
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      setRequestError(err.response?.data?.message || 'No se pudo ejecutar el lote');
    } finally {
      setPhase('done');
      onDone();
    }
  };

  const count = (o: ArcaBatchResult['outcome']) => results.filter((r) => r.outcome === o).length;

  return (
    <Modal isOpen={isOpen} onClose={close} title="Emitir ante ARCA" size="full" showCloseButton={phase !== 'running'}>
      {phase === 'confirm' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-slate-300">
            Se van a emitir <strong>{invoices.length}</strong> {invoices.length === 1 ? 'factura' : 'facturas'} ante ARCA,
            una por vez y en orden de fecha. Si ARCA deja de responder, el lote se corta y las restantes quedan pendientes.
          </p>

          {pastCount > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {pastCount} {pastCount === 1 ? 'es de un día anterior' : 'son de días anteriores'}
                {tooOldCount > 0 && <> ({tooOldCount} con más de {ARCA_MAX_DAYS_BACK} días, que ARCA rechaza)</>}.
                ARCA tampoco acepta una fecha anterior a la del último comprobante autorizado del mismo punto de venta y tipo.
              </p>
              <label className="flex items-start gap-2 text-xs font-medium text-amber-900 dark:text-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={redate}
                  onChange={(e) => setRedate(e.target.checked)}
                  className="mt-0.5 rounded border-amber-300 text-indigo-600 focus:ring-indigo-500"
                />
                Pasar a la fecha de hoy las de días anteriores (el vencimiento se corre igual). Si alguna falla, vuelve a su fecha.
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>Cancelar</Button>
            <Button onClick={run}>
              <Zap className="w-4 h-4 mr-2" />
              Emitir {invoices.length}
            </Button>
          </div>
        </div>
      )}

      {phase === 'running' && (
        <div className="py-10 flex flex-col items-center gap-3 text-center">
          <Spinner />
          <p className="text-sm text-gray-700 dark:text-slate-200">
            Emitiendo {snapshot.length} {snapshot.length === 1 ? 'factura' : 'facturas'} ante ARCA…
          </p>
          <p className="text-xs text-gray-400 dark:text-slate-500">
            Puede tardar unos segundos por factura. No cierres esta ventana.
          </p>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-4">
          {requestError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{requestError}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-3 text-xs">
                {(Object.keys(OUTCOME_CFG) as ArcaBatchResult['outcome'][])
                  .filter((o) => count(o) > 0)
                  .map((o) => {
                    const cfg = OUTCOME_CFG[o];
                    const Icon = cfg.icon;
                    return (
                      <span key={o} className={`inline-flex items-center gap-1 font-semibold ${cfg.cls}`}>
                        <Icon className="w-4 h-4" /> {count(o)} {cfg.label.toLowerCase()}
                      </span>
                    );
                  })}
              </div>
              <div className="max-h-[50vh] overflow-y-auto border border-gray-100 dark:border-slate-700 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-slate-700/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-slate-400">Comprobante</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-slate-400">Fecha</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-slate-400">Resultado</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-slate-400 w-full">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {results.map((r) => {
                      const inv = byId.get(r.id);
                      const cfg = OUTCOME_CFG[r.outcome];
                      const Icon = cfg.icon;
                      return (
                        <tr key={r.id} className="align-top">
                          <td className="px-3 py-2 font-mono font-semibold text-gray-800 dark:text-slate-200 whitespace-nowrap">
                            {inv ? formatInvoiceNumber(inv) : r.number}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-slate-300">
                            {inv ? formatDate(inv.date) : '—'}
                            {r.redated && <span className="block text-[10px] text-amber-600 dark:text-amber-400">pasada a hoy</span>}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap font-semibold ${cfg.cls}`}>
                            <span className="inline-flex items-center gap-1"><Icon className="w-3.5 h-3.5" />{cfg.label}</span>
                          </td>
                          <td className="px-3 py-2 text-gray-600 dark:text-slate-300 break-words">
                            {r.outcome === 'AUTHORIZED'
                              ? <>CAE {r.cae} · {String(r.afipPtVenta).padStart(4, '0')}-{String(r.afipCbtNum).padStart(8, '0')}{r.message ? ` · ${r.message}` : ''}</>
                              : r.message}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex justify-end">
            <Button onClick={close}>Cerrar</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
