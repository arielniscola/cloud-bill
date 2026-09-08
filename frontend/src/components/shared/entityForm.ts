import { clsx } from 'clsx';
import type { TaxCondition } from '../../types';

/**
 * Constantes y helpers compartidos por los formularios de alta de entidades
 * fiscales (clientes y proveedores). Los componentes viven en `EntityFormKit`.
 */

// ── Estilo de campo ──────────────────────────────────────────────
const FIELD_BASE =
  'w-full px-3 py-2 text-sm border rounded-lg text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-400 disabled:bg-gray-50 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed transition-[border-color,box-shadow] duration-150';

export const fieldClass = (hasError?: boolean, className?: string) =>
  clsx(
    FIELD_BASE,
    hasError
      ? 'border-red-300 dark:border-red-700 bg-red-50/40 dark:bg-red-900/15'
      : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700',
    className
  );

// ── Selector de tarjetas ─────────────────────────────────────────
export interface OptionCard<T extends string> {
  value: T;
  label: string;
  desc: string;
}

// ── Condición de IVA ─────────────────────────────────────────────
export const TAX_CONDITIONS_REQUIRING_CUIT: TaxCondition[] = [
  'RESPONSABLE_INSCRIPTO',
  'MONOTRIBUTISTA',
];

export const TAX_LABELS: Record<TaxCondition, string> = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTISTA: 'Monotributista',
  EXENTO: 'Exento',
  CONSUMIDOR_FINAL: 'Consumidor Final',
};

export const TAX_OPTIONS: OptionCard<TaxCondition>[] = [
  { value: 'RESPONSABLE_INSCRIPTO', label: 'Resp. Inscripto', desc: 'IVA discriminado · Factura A' },
  { value: 'MONOTRIBUTISTA', label: 'Monotributista', desc: 'Sin discriminar · Factura B/C' },
  { value: 'EXENTO', label: 'Exento', desc: 'Exento de IVA · Factura B' },
  { value: 'CONSUMIDOR_FINAL', label: 'Cons. Final', desc: 'Sin CUIT requerido · B/C' },
];

export const COMPROBANTE_BY_TAX: Record<TaxCondition, string> = {
  RESPONSABLE_INSCRIPTO: 'Factura A',
  MONOTRIBUTISTA: 'Factura B / C',
  EXENTO: 'Factura B',
  CONSUMIDOR_FINAL: 'Factura B / C',
};

export const requiresCuit = (t: TaxCondition) => TAX_CONDITIONS_REQUIRING_CUIT.includes(t);

export const cuitIssueMessage = (t: TaxCondition) =>
  `${TAX_LABELS[t]} requiere un CUIT de 11 dígitos`;

// ── Búsqueda en el padrón de ARCA ────────────────────────────────
export type PadronState = 'idle' | 'loading' | 'done' | 'error';
