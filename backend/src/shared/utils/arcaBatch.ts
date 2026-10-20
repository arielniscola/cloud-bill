import { todayIso } from './dateRange';

/**
 * Reglas de ARCA (WSFE) que condicionan la emisión de comprobantes pendientes.
 *
 * - Para Concepto 1 (productos) la fecha del comprobante puede ser hasta 5 días
 *   ANTERIOR a la fecha de emisión; más vieja se rechaza.
 * - Dentro de un (PdV, tipo) la fecha no puede ser anterior a la del último
 *   autorizado ([10016]): los pendientes se emiten en orden de fecha.
 */
export const ARCA_MAX_DAYS_BACK = 5;

/** Día calendario argentino (`YYYY-MM-DD`) de un instante — el que se declara como CbteFch. */
export function arcaDayOf(date: Date | string): string {
  return todayIso(new Date(date));
}

/** Días calendario entre dos fechas `YYYY-MM-DD` (b − a). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** true si ARCA rechazaría la fecha por vieja (más de 5 días antes de hoy). */
export function isTooOldForArca(date: Date | string, now: Date = new Date()): boolean {
  return daysBetween(arcaDayOf(date), todayIso(now)) > ARCA_MAX_DAYS_BACK;
}

/** true si la fecha es de un día anterior a hoy (día argentino). */
export function isBeforeToday(date: Date | string, now: Date = new Date()): boolean {
  return arcaDayOf(date) < todayIso(now);
}

interface Sortable {
  date: Date | string;
  type: string;
  createdAt: Date | string;
}

/**
 * Orden de emisión de un lote: por fecha; a igual día, facturas antes que
 * notas (una NC/ND puede necesitar que su factura de origen, en el mismo lote,
 * ya tenga CAE); y por orden de carga.
 */
export function sortForArcaBatch<T extends Sortable>(invoices: T[]): T[] {
  const isNota = (t: string) => (t.startsWith('NOTA_') ? 1 : 0);
  return [...invoices].sort(
    (a, b) =>
      arcaDayOf(a.date).localeCompare(arcaDayOf(b.date)) ||
      isNota(a.type) - isNota(b.type) ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}
