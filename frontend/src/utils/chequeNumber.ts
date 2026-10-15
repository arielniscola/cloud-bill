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

export const cleanChequePart = (s: string) => s.replace(/\s+/g, '');

/** Parte un `checkNumber` guardado en sus tres tramos. */
export function parseChequeNumber(value: string | null | undefined): ChequeNumberParts {
  const raw = (value ?? '').trim();
  if (!raw) return { banco: '', sucursal: '', numero: '' };
  const parts = raw.split('-').map(cleanChequePart);
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
