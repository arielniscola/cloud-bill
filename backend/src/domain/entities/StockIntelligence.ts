export type StockRiskLevel = 'critical' | 'warning' | 'ok' | 'no_data';

export interface StockInsight {
  productId:         string;
  productName:       string;
  sku:               string;
  warehouseId:       string;
  warehouseName:     string;
  categoryName:      string | null;

  // Stock
  quantity:          number;
  reservedQuantity:  number;
  availableStock:    number;
  minQuantity:       number | null;
  cost:              number;            // costo unitario ARS

  // Sales velocity
  totalSoldInWindow: number;            // unidades vendidas en la ventana de análisis
  avgDailySales:     number;            // unidades/día (puede ser 0)
  windowDays:        number;            // días de la ventana analizada

  // Prediction
  daysUntilStockOut: number | null;     // null = sin ventas recientes → no predecible
  riskLevel:         StockRiskLevel;

  // Recommendation
  leadTimeDays:      number;            // días de reposición (por producto o global safetyStockDays)
  recommendedQty:    number;            // cuánto comprar (0 = no hace falta)
  estimatedCost:     number;            // recommendedQty * cost

  // Dead stock
  lastSaleDate:      string | null;
  daysSinceLastSale: number | null;
  isDeadStock:       boolean;

  // Capital
  immobilizedValue:  number;            // availableStock * cost
}

export interface StockIntelligenceSummary {
  criticalCount:      number;           // daysUntilStockOut < safetyStockDays
  warningCount:       number;           // daysUntilStockOut < safetyStockDays * 2
  deadStockCount:     number;
  totalCapital:       number;           // sum(availableStock * cost) de todos los productos
  deadStockCapital:   number;           // capital en productos muertos
  insights:           StockInsight[];
}

export interface StockIntelligenceFilters {
  warehouseId?: string;
  days?:        number;                 // ventana de análisis en días (default 30)
}
