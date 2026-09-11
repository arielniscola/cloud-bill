/**
 * Cotización del día USD → ARS.
 *
 * Fuente: dolarapi.com (dólar oficial, valor de VENTA) — la misma que ya usaba
 * el modal de factura de compra desde el navegador, ahora centralizada para que
 * todas las pantallas (cuenta corriente, listados) conviertan con el MISMO valor.
 *
 * Caché en memoria: se refresca cada `TTL_MS` y, si la API no responde, se
 * devuelve la última cotización conocida marcada como `stale` (con la fecha en
 * que se obtuvo) para que la UI pueda avisarlo. Al reiniciar el proceso la
 * caché arranca vacía: la primera consulta va contra dolarapi.
 */

const SOURCE_URL = 'https://dolarapi.com/v1/dolares/oficial';
const TTL_MS = 30 * 60 * 1000; // 30 minutos
const FETCH_TIMEOUT_MS = 5000;

export interface ExchangeRateResult {
  /** Pesos por dólar (dólar oficial, venta). */
  rate: number;
  /** Momento en que se obtuvo el valor de la fuente. */
  fetchedAt: string;
  /** true = la fuente no respondió y esto es la última cotización conocida. */
  stale: boolean;
  source: string;
}

interface CacheEntry {
  rate: number;
  fetchedAt: number;
}

export class ExchangeRateService {
  private cache: CacheEntry | null = null;
  /** Evita que N requests simultáneos disparen N fetches a dolarapi. */
  private inFlight: Promise<CacheEntry | null> | null = null;

  async getUsdRate(): Promise<ExchangeRateResult | null> {
    const fresh = this.cache && Date.now() - this.cache.fetchedAt < TTL_MS;
    if (!fresh) {
      const fetched = await this.refresh();
      if (fetched) this.cache = fetched;
    }
    if (!this.cache) return null;

    return {
      rate: this.cache.rate,
      fetchedAt: new Date(this.cache.fetchedAt).toISOString(),
      stale: Date.now() - this.cache.fetchedAt >= TTL_MS,
      source: 'dolarapi.com/oficial (venta)',
    };
  }

  private refresh(): Promise<CacheEntry | null> {
    if (this.inFlight) return this.inFlight;

    this.inFlight = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(SOURCE_URL, { signal: controller.signal });
        if (!res.ok) return null;
        const data: any = await res.json();
        const rate = Number(data?.venta);
        if (!Number.isFinite(rate) || rate <= 0) return null;
        return { rate, fetchedAt: Date.now() };
      } catch {
        // Sin internet / API caída: se conserva la última cotización conocida.
        return null;
      } finally {
        clearTimeout(timer);
        this.inFlight = null;
      }
    })();

    return this.inFlight;
  }
}

export const exchangeRateService = new ExchangeRateService();
