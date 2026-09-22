import type { AppSettings } from '../types';

/**
 * Recargo por horario: dentro de la ventana configurada por la empresa, los
 * precios de venta se cargan con un porcentaje extra. NO modifica el precio de
 * lista del producto: solo el precio unitario del comprobante que se está
 * emitiendo (factura y orden de pedido).
 */
export interface TimeSurcharge {
  /** La ventana está activa AHORA (config habilitada + hora dentro + pct > 0). */
  active: boolean;
  /** Porcentaje configurado (0 si no aplica). */
  pct: number;
  from: string;
  to: string;
}

export const NO_SURCHARGE: TimeSurcharge = { active: false, pct: 0, from: '', to: '' };

/** "HH:mm" -> minutos desde medianoche. Devuelve null si el formato no sirve. */
function toMinutes(value: string | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((value ?? '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Resuelve el recargo vigente para un momento dado (por defecto, ahora).
 * La ventana incluye el borde inicial y excluye el final; si `to` es menor que
 * `from`, la ventana cruza la medianoche (ej. 20:00 → 02:00).
 */
export function resolveTimeSurcharge(
  settings: AppSettings | null | undefined,
  at: Date = new Date()
): TimeSurcharge {
  if (!settings?.timeSurchargeEnabled) return NO_SURCHARGE;

  const pct = Number(settings.timeSurchargePct ?? 0);
  if (!Number.isFinite(pct) || pct <= 0) return NO_SURCHARGE;

  const from = toMinutes(settings.timeSurchargeFrom);
  const to   = toMinutes(settings.timeSurchargeTo);
  if (from === null || to === null || from === to) return NO_SURCHARGE;

  const now = at.getHours() * 60 + at.getMinutes();
  const inWindow = from < to
    ? now >= from && now < to
    : now >= from || now < to; // cruza medianoche

  return inWindow
    ? { active: true, pct, from: settings.timeSurchargeFrom!, to: settings.timeSurchargeTo! }
    : NO_SURCHARGE;
}

/** Aplica el recargo a un precio de lista. Redondea a 2 decimales. */
export function applyTimeSurcharge(price: number, surcharge: TimeSurcharge): number {
  if (!surcharge.active || !Number.isFinite(price)) return price;
  return Math.round(price * (1 + surcharge.pct / 100) * 100) / 100;
}
