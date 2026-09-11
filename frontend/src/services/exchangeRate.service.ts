import api from './api';

export interface ExchangeRateInfo {
  /** Pesos por dólar (dólar oficial, venta). */
  rate: number;
  fetchedAt: string;
  /** true = la fuente no respondió y esto es la última cotización conocida. */
  stale: boolean;
  source: string;
}

const exchangeRateService = {
  async getUsdRate(): Promise<ExchangeRateInfo | null> {
    const res = await api.get<{ status: string; data: ExchangeRateInfo | null }>('/exchange-rate');
    return res.data.data;
  },
};

export default exchangeRateService;
