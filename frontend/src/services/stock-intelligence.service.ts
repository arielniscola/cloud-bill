import api from './api';
import type { StockIntelligenceFilters, StockIntelligenceSummary } from '../types';

export const stockIntelligenceService = {
  async getInsights(filters?: StockIntelligenceFilters): Promise<StockIntelligenceSummary> {
    const response = await api.get<{ status: string; data: StockIntelligenceSummary }>(
      '/stock-intelligence',
      { params: filters }
    );
    return response.data.data;
  },
};

export default stockIntelligenceService;
