import { useEffect } from 'react';

import { parseChequeNumber, joinChequeNumber, cleanChequePart as clean } from '../../utils/chequeNumber';
import type { ChequeNumberParts } from '../../utils/chequeNumber';

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
