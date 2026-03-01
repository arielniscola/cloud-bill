export type StockRiskLevel = 'critical' | 'warning' | 'ok' | 'no_data';

export interface StockInsight {
  productId:         string;
  productName:       string;
  sku:               string;
  warehouseId:       string;
  warehouseName:     string;
  categoryName:      string | null;
  quantity:          number;
  reservedQuantity:  number;
  availableStock:    number;
  minQuantity:       number | null;
  cost:              number;
  totalSoldInWindow: number;
  avgDailySales:     number;
  windowDays:        number;
  daysUntilStockOut: number | null;
  riskLevel:         StockRiskLevel;
  leadTimeDays:      number;
  recommendedQty:    number;
  estimatedCost:     number;
  lastSaleDate:      string | null;
  daysSinceLastSale: number | null;
  isDeadStock:       boolean;
  immobilizedValue:  number;
}

export interface StockIntelligenceSummary {
  criticalCount:    number;
  warningCount:     number;
  deadStockCount:   number;
  totalCapital:     number;
  deadStockCapital: number;
  insights:         StockInsight[];
}

export interface StockIntelligenceFilters {
  warehouseId?: string;
  days?:        number;
}
