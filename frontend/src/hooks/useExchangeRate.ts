import { useEffect, useState } from 'react';
import exchangeRateService, { type ExchangeRateInfo } from '../services/exchangeRate.service';

/**
 * Cotización del día USD → ARS, compartida por todas las pantallas que expresan
 * la deuda en pesos (cuentas corrientes, listados de facturas).
 *
 * La caché vive a nivel de módulo: la primera pantalla que la pide dispara el
 * request y el resto reusa el mismo valor, así dos vistas abiertas al mismo
 * tiempo nunca muestran saldos convertidos con cotizaciones distintas.
 */

const TTL_MS = 30 * 60 * 1000;

let cached: { info: ExchangeRateInfo | null; at: number } | null = null;
let inFlight: Promise<ExchangeRateInfo | null> | null = null;
const listeners = new Set<(info: ExchangeRateInfo | null) => void>();

async function load(force = false): Promise<ExchangeRateInfo | null> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.info;
  if (inFlight) return inFlight;

  inFlight = exchangeRateService
    .getUsdRate()
    .catch(() => null)
    .then((info) => {
      // Si el backend no pudo conseguir ninguna, conservamos la última que ya teníamos.
      const next = info ?? cached?.info ?? null;
      cached = { info: next, at: Date.now() };
      listeners.forEach((fn) => fn(next));
      return next;
    })
    .finally(() => { inFlight = null; });

  return inFlight;
}

export interface UseExchangeRate {
  /** Pesos por dólar, o null si nunca se pudo obtener una cotización. */
  rate: number | null;
  info: ExchangeRateInfo | null;
  isLoading: boolean;
  /** true = cotización vieja (la fuente no respondió). */
  isStale: boolean;
  refresh: () => Promise<void>;
}

export function useExchangeRate(): UseExchangeRate {
  const [info, setInfo] = useState<ExchangeRateInfo | null>(cached?.info ?? null);
  const [isLoading, setIsLoading] = useState(!cached);

  useEffect(() => {
    let alive = true;
    listeners.add(setInfo);
    load().finally(() => { if (alive) setIsLoading(false); });
    return () => { alive = false; listeners.delete(setInfo); };
  }, []);

  return {
    rate: info?.rate ?? null,
    info,
    isLoading,
    isStale: info?.stale ?? false,
    refresh: async () => { setIsLoading(true); await load(true); setIsLoading(false); },
  };
}
