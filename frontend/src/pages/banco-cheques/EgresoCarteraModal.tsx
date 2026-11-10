import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { CheckCircle2, Plus, Search, Settings2 } from 'lucide-react';
import { Button, Modal } from '../../components/ui';
import { formatChequeNumber } from '../../components/shared';
import chequeEgresosService from '../../services/cheque-egresos.service';
import { useAuthStore } from '../../stores';
import type { CarteraCheque, ChequeEgreso, ChequeEgresoReason } from '../../types/cheque.types';
import { formatCurrency } from '../../utils/formatters';
import { apiErrorMessage } from '../../utils/apiError';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onDone: (egreso: ChequeEgreso) => void;
}

/** N° de cheque formateado, o vacío si no tiene. */
const chqNum = (v: string | null | undefined): string => (v ? formatChequeNumber(v) : '');

/** Hoy en Argentina (YYYY-MM-DD). */
const todayAR = (): string => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

const fieldClass =
  'block w-full rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 ' +
  'px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500';

/**
 * Egreso de un cheque en cartera: se busca el cheque (manual o de cobranza),
 * se elige el motivo y la fecha, y queda registrado el usuario que lo egresó.
 */
export default function EgresoCarteraModal({ isOpen, onClose, onDone }: Props) {
  const userName = useAuthStore((s) => s.user?.name ?? '');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CarteraCheque[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CarteraCheque | null>(null);
  const [reasons, setReasons] = useState<ChequeEgresoReason[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [newReason, setNewReason] = useState<string | null>(null);
  const [date, setDate] = useState(todayAR());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Al abrir: limpia el formulario y carga los motivos activos.
  useEffect(() => {
    if (!isOpen) return;
    setSearch(''); setSelected(null); setReasonId(''); setNewReason(null);
    setDate(todayAR()); setNotes('');
    chequeEgresosService.getReasons().then(setReasons).catch(() => toast.error('No se pudieron cargar los motivos'));
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [isOpen]);

  // Búsqueda en cartera con un pequeño debounce.
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      chequeEgresosService.cartera(search.trim())
        .then((rows) => { if (alive) setResults(rows); })
        .catch(() => { if (alive) setResults([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [search, isOpen]);

  const total = useMemo(() => results.reduce((s, r) => s + Number(r.amount), 0), [results]);

  const addReason = async () => {
    const name = (newReason ?? '').trim();
    if (name.length < 2) { toast.error('Ingresá el nombre del motivo'); return; }
    try {
      const created = await chequeEgresosService.createReason(name);
      setReasons((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setReasonId(created.id);
      setNewReason(null);
    } catch (error) {
      toast.error(apiErrorMessage(error) ?? 'No se pudo crear el motivo');
    }
  };

  const submit = async () => {
    if (!selected) { toast.error('Buscá y elegí el cheque a egresar'); return; }
    if (!reasonId) { toast.error('Elegí el motivo del egreso'); return; }
    setSaving(true);
    try {
      const egreso = await chequeEgresosService.create({
        source: selected.source, id: selected.id, reasonId, date, notes: notes.trim() || null,
      });
      toast.success(`Cheque ${chqNum(egreso.checkNumber) || selected.number} egresado de cartera`);
      onDone(egreso);
    } catch (error) {
      toast.error(apiErrorMessage(error) ?? 'No se pudo egresar el cheque');
    } finally {
      setSaving(false);
    }
  };

  const isOverdue = (c: CarteraCheque) => !!c.dueDate && c.dueDate.slice(0, 10) < todayAR();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Egreso de cheque en cartera" size="full">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
        {/* ── Búsqueda ── */}
        <div className="min-w-0">
          <label htmlFor="egreso-search" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Buscar cheque</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              id="egreso-search"
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N° de cheque, banco, librador, cliente o importe"
              className={clsx(fieldClass, 'pl-9')}
              autoComplete="off"
            />
          </div>
          <p className="mt-1.5 text-xs text-gray-400 dark:text-slate-500">
            {searching ? 'Buscando…' : `${results.length} cheque${results.length === 1 ? '' : 's'} en cartera${results.length ? ` · ${formatCurrency(total, 'ARS')}` : ''}`}
          </p>

          <div className="mt-2 max-h-[46vh] overflow-auto rounded-lg border border-gray-200 dark:border-slate-700">
            {results.length === 0 && !searching ? (
              <p className="px-4 py-10 text-center text-sm text-gray-400 dark:text-slate-500">No hay cheques en cartera que coincidan.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                {results.map((c) => {
                  const active = selected?.id === c.id && selected.source === c.source;
                  return (
                    <li key={`${c.source}-${c.id}`}>
                      <button
                        type="button"
                        onClick={() => setSelected(c)}
                        aria-pressed={active}
                        className={clsx(
                          'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                          active ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-gray-50 dark:hover:bg-slate-700/50',
                        )}
                      >
                        <span className={clsx('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                          active ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300 dark:border-slate-500')}>
                          {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2">
                            <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                              {chqNum(c.checkNumber) || '(sin N°)'}
                            </span>
                            <span className={clsx('rounded px-1.5 py-0.5 text-[10px] font-semibold',
                              c.source === 'RECIBO'
                                ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300')}>
                              {c.source === 'RECIBO' ? `Cobranza ${c.number}` : c.number}
                            </span>
                          </span>
                          <span className="block truncate text-xs text-gray-500 dark:text-slate-400">
                            {[c.bank, c.holder].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                            {formatCurrency(Number(c.amount), (c.currency as 'ARS' | 'USD') ?? 'ARS')}
                          </span>
                          <span className={clsx('block text-xs', isOverdue(c) ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-400 dark:text-slate-500')}>
                            {c.dueDate ? `vto ${c.dueDate.slice(0, 10).split('-').reverse().join('/')}` : 'sin vto'}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ── Datos del egreso ── */}
        <div className="space-y-4">
          <div className={clsx('rounded-lg border p-3 text-sm',
            selected ? 'border-indigo-200 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-900/20' : 'border-dashed border-gray-200 dark:border-slate-600')}>
            {selected ? (
              <>
                <p className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Cheque elegido
                </p>
                <p className="mt-1 font-mono font-semibold text-gray-900 dark:text-white">{chqNum(selected.checkNumber) || selected.number}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">{[selected.bank, selected.holder].filter(Boolean).join(' · ')}</p>
                <p className="mt-1 text-base font-bold tabular-nums text-gray-900 dark:text-white">
                  {formatCurrency(Number(selected.amount), (selected.currency as 'ARS' | 'USD') ?? 'ARS')}
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-400 dark:text-slate-500">Elegí un cheque de la lista.</p>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="egreso-reason" className="text-sm font-medium text-gray-700 dark:text-slate-300">Motivo *</label>
              <Link to="/cheque-egreso-reasons" className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600" title="Administrar motivos">
                <Settings2 className="h-3.5 w-3.5" /> Motivos
              </Link>
            </div>
            {newReason === null ? (
              <div className="flex gap-2">
                <select id="egreso-reason" value={reasonId} onChange={(e) => setReasonId(e.target.value)} className={fieldClass}>
                  <option value="">— Elegir motivo —</option>
                  {reasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <Button type="button" variant="outline" size="sm" onClick={() => setNewReason('')} title="Nuevo motivo">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addReason(); }
                    if (e.key === 'Escape') setNewReason(null);
                  }}
                  placeholder="Nuevo motivo"
                  aria-label="Nombre del nuevo motivo"
                  className={fieldClass}
                />
                <Button type="button" size="sm" onClick={addReason}>Agregar</Button>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="egreso-date" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Fecha del egreso</label>
            <input id="egreso-date" type="date" value={date} max={todayAR()} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
          </div>

          <div>
            <label htmlFor="egreso-notes" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Observaciones</label>
            <textarea
              id="egreso-notes"
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="A quién se entregó, dónde se cambió…"
              className={clsx(fieldClass, 'resize-none')}
            />
          </div>

          <p className="text-xs text-gray-400 dark:text-slate-500">
            Queda registrado a nombre de <span className="font-medium text-gray-600 dark:text-slate-300">{userName || 'tu usuario'}</span>.
          </p>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button onClick={submit} isLoading={saving} disabled={!selected || !reasonId} className="flex-1">Egresar cheque</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
