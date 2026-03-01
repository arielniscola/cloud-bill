import { StockIntelligenceFilters, StockIntelligenceSummary } from '../entities/StockIntelligence';

export interface IStockIntelligenceRepository {
  getInsights(filters: StockIntelligenceFilters): Promise<StockIntelligenceSummary>;
}
