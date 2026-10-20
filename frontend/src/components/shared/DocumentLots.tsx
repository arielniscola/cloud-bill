import type { DocumentLot } from '../../types';

const fmtDate = (d: string) => d.split('-').reverse().join('/');
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('es-AR', { maximumFractionDigits: 2 }));

/** "Lote L-231 · vto 12/05/2027 ×6" debajo de una línea del comprobante. */
export function DocumentLotsLine({ lots, showQuantity = true }: { lots: DocumentLot[]; showQuantity?: boolean }) {
  if (lots.length === 0) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-slate-400">
      {lots.map((l) => (
        <span key={`${l.lotNumber}|${l.expiresAt ?? ''}`}>
          Lote <span className="font-mono text-gray-700 dark:text-slate-300">{l.lotNumber}</span>
          {l.expiresAt && <> · vto {fmtDate(l.expiresAt)}</>}
          {showQuantity && <> ×{fmtQty(l.quantity)}</>}
        </span>
      ))}
    </div>
  );
}
