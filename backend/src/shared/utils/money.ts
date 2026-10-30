import { Prisma } from '@prisma/client';
/**
 * Redondeo a centavos. El epsilon corrige los casos en que el binario queda
 * apenas por debajo del medio centavo (1.005 * 100 = 100.49999…) y
 * `Math.round` a secas redondeaba para abajo.
 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Factor para llevar a PESOS el importe de un comprobante con la cotización
 * que quedó guardada en él (ventas, compras, cobros, pagos: lo que valió ese
 * día). En ARS es SIEMPRE 1: hay comprobantes en pesos que guardan la
 * cotización del día en `exchangeRate` (se usa al imputar contra documentos en
 * dólares) y multiplicar por ella inflaría el importe ~1500 veces.
 */
export function arsFactor(currency: unknown, exchangeRate: unknown): number {
  if (!currency || String(currency) === 'ARS') return 1;
  const rate = Number(exchangeRate);
  return rate > 0 ? rate : 1;
}

/**
 * `arsFactor` en SQL, para una tabla con `currency` y `exchangeRate`
 * (`alias` es el alias de la tabla en la consulta; nunca viene del usuario).
 */
export function arsFactorSql(alias: string): Prisma.Sql {
  return Prisma.raw(
    `(CASE WHEN ${alias}.currency::text = 'ARS' THEN 1 WHEN ${alias}."exchangeRate" > 0 THEN ${alias}."exchangeRate" ELSE 1 END)`,
  );
}
