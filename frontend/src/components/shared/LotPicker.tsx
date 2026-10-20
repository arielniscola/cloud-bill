import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Layers, AlertTriangle } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { fetchLots, isExpired, fefo, planLots } from '../../utils/stockLots';
import { formatDate } from '../../utils/formatters';
import type { ItemLotDTO, StockLot } from '../../types';

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('es-AR', { maximumFractionDigits: 2 }));

export function ExpiryBadge({ lot }: { lot: Pick<StockLot, 'expiresAt' | 'daysToExpiry'> }) {
  if (!lot.expiresAt) {
    return <span className="text-xs text-gray-400 dark:text-slate-500">Sin vencimiento</span>;
  }
  const d = lot.daysToExpiry ?? 0;
  const tone = d < 0
    ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
    : d <= 30
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300';
  const label = d < 0 ? `Vencido hace ${-d} d` : d === 0 ? 'Vence hoy' : `Vence en ${d} d`;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-sm text-gray-700 dark:text-slate-300 tabular-nums">{formatDate(lot.expiresAt)}</span>
      <span className={clsx('text-[11px] font-semibold px-1.5 py-0.5 rounded', tone)}>{label}</span>
    </span>
  );
}

interface LotPickerProps {
  productId: string;
  variantId?: string | null;
  warehouseId: string;
  quantity: number;
  value?: ItemLotDTO[];
  onChange: (lots: ItemLotDTO[] | undefined) => void;
  disabled?: boolean;
}

/**
 * Línea compacta con los lotes de los que va a salir una línea de venta, y un
 * modal para elegirlos. Sin elección, muestra lo que el sistema asignaría
 * (vence antes primero, salteando vencidos mientras haya vigentes).
 */
export default function LotPicker({ productId, variantId, warehouseId, quantity, value, onChange, disabled }: LotPickerProps) {
  const [lots, setLots] = useState<StockLot[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!productId || !warehouseId) { setLots(null); return; }
    let cancelled = false;
    setError(false);
    fetchLots(productId, variantId, warehouseId)
      .then((l) => { if (!cancelled) setLots(l); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [productId, variantId, warehouseId]);

  const plan = useMemo(() => (lots ? planLots(lots, quantity || 0, value) : null), [lots, quantity, value]);

  if (!productId || !warehouseId) return null;
  if (error) return <p className="mt-1 text-xs text-red-500">No se pudieron cargar los lotes</p>;
  if (!lots || !plan) return <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Cargando lotes…</p>;

  const hasExpired = plan.lines.some((l) => isExpired(l.lot));
  const isAuto = !value?.length;

  const openModal = () => {
    const init: Record<string, string> = {};
    for (const v of value ?? []) init[v.lotId] = String(v.quantity);
    setDraft(init);
    setOpen(true);
  };

  const draftTotal = Object.values(draft).reduce((acc, v) => acc + (Number(v) || 0), 0);
  const draftErrors = lots
    .filter((l) => (Number(draft[l.id]) || 0) > l.quantity)
    .map((l) => `El lote ${l.lotNumber} tiene ${fmtQty(l.quantity)}`);
  if (draftTotal > quantity) draftErrors.push(`Asignaste ${fmtQty(draftTotal)} y la línea es de ${fmtQty(quantity)}`);
  const draftExpired = lots.some((l) => (Number(draft[l.id]) || 0) > 0 && isExpired(l));

  const apply = () => {
    const chosen = Object.entries(draft)
      .map(([lotId, q]) => ({ lotId, quantity: Number(q) || 0 }))
      .filter((c) => c.quantity > 0);
    onChange(chosen.length ? chosen : undefined);
    setOpen(false);
  };

  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
        <Layers className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" aria-hidden="true" />
        {lots.length === 0 ? (
          <span className="text-red-600 dark:text-red-400">Sin lotes con stock en el depósito</span>
        ) : (
          plan.lines.map((l) => (
            <span
              key={l.lot.id}
              title={l.lot.expiresAt ? `Vence ${formatDate(l.lot.expiresAt)}` : 'Sin vencimiento'}
              className={clsx(
                'px-1.5 py-0.5 rounded font-medium tabular-nums',
                isExpired(l.lot)
                  ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                  : 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-200',
              )}
            >
              {l.lot.lotNumber} ×{fmtQty(l.quantity)}
            </span>
          ))
        )}
        {lots.length > 0 && (
          <span className="text-gray-400 dark:text-slate-500">{isAuto ? '(automático)' : plan.lines.some((l) => l.auto) ? '(resto automático)' : ''}</span>
        )}
        {!disabled && lots.length > 0 && (
          <button
            type="button"
            onClick={openModal}
            className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            {isAuto ? 'Elegir lote' : 'Cambiar'}
          </button>
        )}
        {hasExpired && (
          <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            Incluye un lote vencido
          </span>
        )}
        {plan.missing > 0 && lots.length > 0 && (
          <span className="font-medium text-amber-600 dark:text-amber-400">Faltan {fmtQty(plan.missing)} en lotes</span>
        )}
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Elegir lote" size="lg">
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
          La línea es de <strong className="text-gray-900 dark:text-white">{fmtQty(quantity)}</strong>. Lo que no asignes se toma
          automáticamente del lote que vence antes.
        </p>
        <div className="overflow-x-auto border border-gray-200 dark:border-slate-700 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800 text-xs uppercase text-gray-500 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Lote</th>
                <th className="px-3 py-2 text-left font-semibold">Vencimiento</th>
                <th className="px-3 py-2 text-right font-semibold">Disponible</th>
                <th className="px-3 py-2 text-right font-semibold w-32">Cantidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {fefo(lots).map((l) => (
                <tr key={l.id} className={isExpired(l) ? 'bg-red-50/40 dark:bg-red-900/10' : undefined}>
                  <td className="px-3 py-2 font-mono text-gray-900 dark:text-white">{l.lotNumber}</td>
                  <td className="px-3 py-2"><ExpiryBadge lot={l} /></td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-slate-300">{fmtQty(l.quantity)}</td>
                  <td className="px-3 py-2 text-right">
                    <label className="sr-only" htmlFor={`lot-q-${l.id}`}>Cantidad del lote {l.lotNumber}</label>
                    <input
                      id={`lot-q-${l.id}`}
                      type="number"
                      min="0"
                      step="any"
                      max={l.quantity}
                      value={draft[l.id] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [l.id]: e.target.value }))}
                      placeholder="0"
                      className="w-24 px-2 py-1 text-right text-sm rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-sm text-gray-600 dark:text-slate-300">
          Asignado <strong className="tabular-nums">{fmtQty(draftTotal)}</strong> de {fmtQty(quantity)}
          {draftTotal < quantity && <span className="text-gray-400 dark:text-slate-500"> · el resto automático</span>}
        </div>
        {draftExpired && (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            Elegiste un lote vencido. Se puede entregar igual.
          </p>
        )}
        {draftErrors.map((e) => <p key={e} className="mt-2 text-sm text-red-600 dark:text-red-400">{e}</p>)}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => { onChange(undefined); setOpen(false); }}>
            Automático
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="button" onClick={apply} disabled={draftErrors.length > 0}>Aplicar</Button>
        </div>
      </Modal>
    </>
  );
}
