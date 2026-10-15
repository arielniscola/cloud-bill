/**
 * Redondeo a centavos. El epsilon corrige los casos en que el binario queda
 * apenas por debajo del medio centavo (1.005 * 100 = 100.49999…) y
 * `Math.round` a secas redondeaba para abajo.
 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
