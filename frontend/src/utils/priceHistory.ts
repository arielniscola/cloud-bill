import type { PriceChangeSource } from '../types';

/** Cómo se muestra cada origen de un cambio de precio. */
export const PRICE_SOURCE_LABEL: Record<PriceChangeSource, string> = {
  CREATE:           'Alta del producto',
  MANUAL:           'Edición',
  BULK:             'Actualización masiva',
  IMPORT:           'Importación',
  USD_RECALC:       'Recálculo de costos USD',
  PRICE_LIST_RATE:  'Lista de precios (dólar del día)',
  PRICE_LIST_ADJUST: 'Lista de precios (ajuste en pesos)',
  PRICE_LIST_EDIT: 'Lista de precios (edición en línea)',
  PRICE_LIST_IMPORT: 'Lista de precios (importada del proveedor)',
  PURCHASE_INVOICE: 'Factura de compra',
  REVERT:           'Deshacer',
  OTHER:            'Otro',
};

/** Variación porcentual; null si no hay valor anterior o no cambió. */
export function pctChange(oldV: number | null, newV: number | null): number | null {
  if (oldV == null || newV == null || oldV <= 0 || Math.abs(newV - oldV) < 0.005) return null;
  return ((newV - oldV) / oldV) * 100;
}

export const formatPct = (p: number) => `${p > 0 ? '+' : ''}${p.toFixed(1)}%`;
