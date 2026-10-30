import type { Product } from '../types';

/**
 * Costo del producto expresado en la moneda del comprobante de compra.
 *  · ARS → `cost` (si el producto está dolarizado ya es el derivado del USD).
 *  · USD → `costUSD`; si el producto no tiene costo en USD, el costo en pesos
 *          convertido con la cotización del comprobante (`converted: true`).
 * null = no hay forma de expresarlo (USD sin costo USD ni cotización).
 */
export function productCostIn(
  p: Pick<Product, 'cost' | 'costUSD'>,
  currency: string,
  exchangeRate: number,
): { value: number; converted: boolean } | null {
  if (currency !== 'USD') return { value: Number(p.cost) || 0, converted: false };
  if (p.costUSD != null && Number(p.costUSD) > 0) return { value: Number(p.costUSD), converted: false };
  if (exchangeRate > 1) return { value: Math.round((Number(p.cost) / exchangeRate) * 100) / 100, converted: true };
  return null;
}
