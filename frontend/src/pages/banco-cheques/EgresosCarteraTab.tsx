import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Undo2 } from 'lucide-react';
import { Button, Modal } from '../../components/ui';
import { Pagination, SearchInput, formatChequeNumber } from '../../components/shared';
import chequeEgresosService from '../../services/cheque-egresos.service';
import type { ChequeEgreso, ChequeEgresoReason } from '../../types/cheque.types';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { apiErrorMessage } from '../../utils/apiError';

interface Props {
  /** Cambia cuando se registra un egreso nuevo, para recargar. */
  reloadKey: number;
  /** Solo ADMIN puede anular un egreso. */
  canCancel: boolean;
  /** Avisa al padre que un cheque volvió a cartera. */
  onChanged: () => void;
}

const selectClass =
  'rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

/** Historial de egresos de cheques en cartera: qué salió, por qué, quién y cuándo. */
export default function EgresosCarteraTab({ reloadKey, canCancel, onChanged }: Props) {
  const [rows, setRows] = useState<ChequeEgreso[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');
  const [reasonId, setReasonId] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'CANCELLED'>('ACTIVE');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reasons, setReasons] = useState<ChequeEgresoReason[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ChequeEgreso | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => { chequeEgresosService.getReasons(true).then(setReasons).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await chequeEgresosService.list({
        page, limit,
        search: search || undefined,
        reasonId: reasonId || undefined,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setRows(res.data); setTotal(res.total); setTotalPages(res.totalPages);
    } catch {
      toast.error('No se pudieron cargar los egresos');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, reasonId, status, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load, reloadKey]);
  useEffect(() => { setPage(1); }, [search, reasonId, status, dateFrom, dateTo]);

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await chequeEgresosService.cancel(cancelTarget.id, cancelReason.trim());
      toast.success('Egreso anulado: el cheque volvió a cartera');
      setCancelTarget(null); setCancelReason('');
      load(); onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error) ?? 'No se pudo anular el egreso');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 p-4 border-b border-gray-100 dark:border-slate-700">
        <div className="w-full sm:w-72">
          <SearchInput value={search} onChange={setSearch} placeholder="N° de cheque, banco, librador, usuario…" />
        </div>
        <select aria-label="Motivo" value={reasonId} onChange={(e) => setReasonId(e.target.value)} className={selectClass}>
          <option value="">Todos los motivos</option>
          {reasons.map((r) => <option key={r.id} value={r.id}>{r.name}{r.isActive ? '' : ' (inactivo)'}</option>)}
        </select>
        <select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={selectClass}>
          <option value="ACTIVE">Vigentes</option>
          <option value="CANCELLED">Anulados</option>
          <option value="">Todos</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
          Desde <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={selectClass} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
          Hasta <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={selectClass} />
        </label>
        <Link to="/cheque-egreso-reasons" className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
          Administrar motivos
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-800/60 text-[11px] uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Fecha</th>
              <th className="px-4 py-2.5 text-left font-semibold">Cheque</th>
              <th className="px-4 py-2.5 text-left font-semibold">Librador / cliente</th>
              <th className="px-4 py-2.5 text-right font-semibold">Importe</th>
              <th className="px-4 py-2.5 text-left font-semibold">Motivo</th>
              <th className="px-4 py-2.5 text-left font-semibold">Egresado por</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {loading && rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Cargando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No hay egresos de cartera.</td></tr>
            ) : rows.map((e) => {
              const cancelled = e.status === 'CANCELLED';
              return (
                <tr key={e.id} className={clsx(cancelled && 'opacity-60')}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-700 dark:text-slate-300">{formatDate(e.date)}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx('font-mono text-xs font-semibold text-gray-900 dark:text-white', cancelled && 'line-through')}>
                      {e.checkNumber ? formatChequeNumber(e.checkNumber) : '(sin N°)'}
                    </span>
                    <span className="block text-xs text-gray-400 dark:text-slate-500">
                      {[e.bank, e.source === 'RECIBO' ? `Cobranza ${e.sourceNumber ?? ''}` : e.sourceNumber].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 dark:text-slate-300">{e.holder ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap text-gray-900 dark:text-white">
                    {formatCurrency(e.amount, (e.currency as 'ARS' | 'USD') ?? 'ARS')}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-gray-800 dark:text-slate-200">{e.reasonName}</span>
                    {e.notes && <span className="block max-w-xs truncate text-xs text-gray-500 dark:text-slate-400" title={e.notes}>{e.notes}</span>}
                    {cancelled && (
                      <span className="block text-xs text-red-600 dark:text-red-400">
                        Anulado{e.cancelledBy?.name ? ` por ${e.cancelledBy.name}` : ''}{e.cancelledAt ? ` el ${formatDate(e.cancelledAt)}` : ''}
                        {e.cancelReason ? ` — ${e.cancelReason}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="text-gray-800 dark:text-slate-200">{e.user.name}</span>
                    <span className="block text-xs text-gray-400 dark:text-slate-500">{formatDateTime(e.createdAt)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {canCancel && !cancelled && (
                      <button
                        type="button"
                        onClick={() => setCancelTarget(e)}
                        title="Anular egreso y devolver el cheque a cartera"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-900/20"
                      >
                        <Undo2 className="h-3.5 w-3.5" /> Anular
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="border-t border-gray-100 dark:border-slate-700 px-4 py-3">
          <Pagination page={page} totalPages={totalPages} limit={limit} total={total} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1); }} />
        </div>
      )}

      <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Anular egreso" size="md">
        {cancelTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-slate-300">
              El cheque <span className="font-mono font-semibold">{cancelTarget.checkNumber ? formatChequeNumber(cancelTarget.checkNumber) : ''}</span> por{' '}
              <span className="font-semibold">{formatCurrency(cancelTarget.amount, (cancelTarget.currency as 'ARS' | 'USD') ?? 'ARS')}</span> vuelve a cartera.
              El egreso queda en el historial como anulado.
            </p>
            <div>
              <label htmlFor="cancel-reason" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Motivo de la anulación (opcional)</label>
              <input id="cancel-reason" value={cancelReason} maxLength={300} onChange={(ev) => setCancelReason(ev.target.value)}
                className="block w-full rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCancelTarget(null)}>Volver</Button>
              <Button variant="danger" onClick={confirmCancel} isLoading={cancelling}>Anular egreso</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
