import { useEffect } from 'react';

/**
 * N° de cheque en el formato "nro_banco-nro_sucursal-nro_cheque".
 * El valor se sigue guardando como un ÚNICO string (campo `checkNumber` /
 * `reference`), con los tres tramos unidos por guiones.
 */
export interface ChequeNumberParts {
  banco: string;
  sucursal: string;
  numero: string;
}

const clean = (s: string) => s.replace(/\s+/g, '');

/** Parte un `checkNumber` guardado en sus tres tramos. */
export function parseChequeNumber(value: string | null | undefined): ChequeNumberParts {
  const raw = (value ?? '').trim();
  if (!raw) return { banco: '', sucursal: '', numero: '' };
  const parts = raw.split('-').map(clean);
  if (parts.length >= 3) {
    return { banco: parts[0], sucursal: parts[1], numero: parts.slice(2).join('-') };
  }
  if (parts.length === 2) return { banco: parts[0], sucursal: '', numero: parts[1] };
  // Valores viejos: solo el número del cheque.
  return { banco: '', sucursal: '', numero: parts[0] };
}

/** Une los tramos en el string guardado. Vacío si no hay ningún tramo. */
export function joinChequeNumber(p: ChequeNumberParts): string {
  const { banco, sucursal, numero } = p;
  if (!banco && !sucursal && !numero) return '';
  if (!banco && !sucursal) return numero;
  return [banco, sucursal, numero].join('-');
}

/** Muestra un `checkNumber` normalizado como "banco-sucursal-nro". */
export function formatChequeNumber(value: string | null | undefined): string {
  const p = parseChequeNumber(value);
  return joinChequeNumber(p) || '—';
}

interface Props {
  value: string | null | undefined;
  onChange: (value: string) => void;
  label?: string;
  /** N° de banco sugerido (código del catálogo) — se completa si está vacío. */
  bancoCode?: string | null;
  /** N° de sucursal sugerido (catálogo de bancos) — se completa si está vacío. */
  sucursal?: string | null;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  labelClassName?: string;
}

const cellCls =
  'w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 ' +
  'text-gray-900 dark:text-white px-2 py-2 text-sm font-mono text-center tabular-nums ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50';

export function ChequeNumberInput({
  value, onChange, label = 'N° de cheque', bancoCode, sucursal,
  disabled, required, error, labelClassName,
}: Props) {
  const parts = parseChequeNumber(value);

  const setPart = (patch: Partial<ChequeNumberParts>) => {
    onChange(joinChequeNumber({ ...parts, ...patch }));
  };

  // Al elegir un banco del catálogo, precompleta banco/sucursal si están vacíos.
  useEffect(() => {
    const banco = parts.banco || (bancoCode ?? '');
    const suc = parts.sucursal || (sucursal ?? '');
    if (banco !== parts.banco || suc !== parts.sucursal) {
      onChange(joinChequeNumber({ ...parts, banco, sucursal: suc }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bancoCode, sucursal]);

  return (
    <div>
      {label && (
        <label className={labelClassName ?? 'block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1'}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="flex items-center gap-1">
        <input
          type="text" inputMode="numeric" disabled={disabled}
          value={parts.banco}
          onChange={(e) => setPart({ banco: clean(e.target.value.replace(/-/g, '')) })}
          placeholder="Banco"
          title="N° de banco"
          className={`${cellCls} basis-1/4`}
        />
        <span className="text-gray-400 dark:text-slate-500 select-none">-</span>
        <input
          type="text" inputMode="numeric" disabled={disabled}
          value={parts.sucursal}
          onChange={(e) => setPart({ sucursal: clean(e.target.value.replace(/-/g, '')) })}
          placeholder="Suc."
          title="N° de sucursal"
          className={`${cellCls} basis-1/4`}
        />
        <span className="text-gray-400 dark:text-slate-500 select-none">-</span>
        <input
          type="text" inputMode="numeric" disabled={disabled}
          value={parts.numero}
          onChange={(e) => setPart({ numero: clean(e.target.value.replace(/-/g, '')) })}
          placeholder="N° cheque"
          title="N° de cheque"
          className={`${cellCls} basis-2/4`}
        />
      </div>
      <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-500">Formato: banco-sucursal-n° cheque</p>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export default ChequeNumberInput;
