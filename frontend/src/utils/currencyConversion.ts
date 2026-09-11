/**
 * Conversión a pesos para las vistas de deuda (cuentas corrientes y listados).
 *
 * Regla acordada: la deuda se EXPRESA en pesos usando la cotización del día
 * (no la congelada del comprobante), y el importe original en dólares queda
 * como referencia. La base de datos no cambia: los comprobantes y movimientos
 * se siguen guardando en su moneda; esto es sólo presentación.
 */

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Convierte a ARS con la cotización del día. Devuelve null si el importe está
 * en una moneda extranjera y no hay cotización disponible (la UI muestra
 * entonces el importe original y avisa).
 */
export function toArs(amount: number, currency: string | null | undefined, rate: number | null): number | null {
  if (!currency || currency === 'ARS') return amount;
  if (!rate || rate <= 0) return null;
  return round2(amount * rate);
}

/** ARS → moneda del comprobante (para imputar en pesos contra una factura en USD). */
export function fromArs(amountArs: number, currency: string | null | undefined, rate: number | null): number | null {
  if (!currency || currency === 'ARS') return amountArs;
  if (!rate || rate <= 0) return null;
  return round2(amountArs / rate);
}

/** true si el importe necesita conversión (moneda extranjera). */
export const isForeign = (currency: string | null | undefined): boolean =>
  !!currency && currency !== 'ARS';
