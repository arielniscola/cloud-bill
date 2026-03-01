import { injectable } from 'tsyringe';
import { IStockIntelligenceRepository } from '../../../domain/repositories/IStockIntelligenceRepository';
import {
  StockInsight,
  StockIntelligenceFilters,
  StockIntelligenceSummary,
  StockRiskLevel,
} from '../../../domain/entities/StockIntelligence';
import prisma from '../prisma';

// Helper type for the included stock row (Prisma client may be stale; we cast)
interface StockWithIncludes {
  productId:        string;
  warehouseId:      string;
  quantity:         { toString(): string };
  reservedQuantity: { toString(): string };
  minQuantity:      { toString(): string } | null;
  product: {
    id:           string;
    sku:          string;
    name:         string;
    cost:         { toString(): string };
    leadTimeDays: number | null;
    category:     { name: string } | null;
  };
  warehouse: {
    id:   string;
    name: string;
  };
}

@injectable()
export class PrismaStockIntelligenceRepository implements IStockIntelligenceRepository {
  async getInsights(filters: StockIntelligenceFilters): Promise<StockIntelligenceSummary> {
    const days       = filters.days ?? 30;
    const windowFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // ── 1. Fetch app settings for thresholds ─────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings: any = await prisma.appSettings.findUnique({ where: { id: 'default' } });
    const deadStockDays   = (settings?.deadStockDays   as number | undefined) ?? 90;
    const safetyStockDays = (settings?.safetyStockDays as number | undefined) ?? 14;
    const deadStockFrom   = new Date(Date.now() - deadStockDays * 24 * 60 * 60 * 1000);

    // ── 2. Load stock rows with product + warehouse ───────────────────────────
    const stocks = (await (prisma.stock.findMany as Function)({
      where: {
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        product: { isActive: true },
      },
      include: {
        product: {
          select: {
            id:           true,
            sku:          true,
            name:         true,
            cost:         true,
            leadTimeDays: true,
            category:     { select: { name: true } },
          },
        },
        warehouse: { select: { id: true, name: true } },
      },
    })) as StockWithIncludes[];

    if (stocks.length === 0) {
      return { criticalCount: 0, warningCount: 0, deadStockCount: 0, totalCapital: 0, deadStockCapital: 0, insights: [] };
    }

    // ── 3. Sales velocity in the analysis window (SALE + REMITO_OUT) ──────────
    const salesAgg = await prisma.stockMovement.groupBy({
      by: ['productId', 'warehouseId'],
      where: {
        type:      { in: ['SALE', 'REMITO_OUT'] },
        createdAt: { gte: windowFrom },
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      },
      _sum: { quantity: true },
    });

    const salesMap = new Map<string, number>();
    for (const row of salesAgg) {
      const key = `${row.productId}::${row.warehouseId}`;
      salesMap.set(key, Number(row._sum.quantity ?? 0));
    }

    // ── 4. Last sale date per product+warehouse ───────────────────────────────
    // Single query ordered desc; we pick first occurrence per key in memory.
    const productWarehousePairs = stocks.map((s) => ({
      productId:   s.productId,
      warehouseId: s.warehouseId,
    }));

    const lastSaleMovements = await prisma.stockMovement.findMany({
      where: {
        type: { in: ['SALE', 'REMITO_OUT'] },
        OR:   productWarehousePairs,
      },
      select:  { productId: true, warehouseId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const lastSaleMap = new Map<string, Date>();
    for (const mov of lastSaleMovements) {
      const key = `${mov.productId}::${mov.warehouseId}`;
      if (!lastSaleMap.has(key)) {
        lastSaleMap.set(key, mov.createdAt);
      }
    }

    // ── 5. Build per-product insights ─────────────────────────────────────────
    const now      = Date.now();
    const insights: StockInsight[] = stocks.map((stock) => {
      const key            = `${stock.productId}::${stock.warehouseId}`;
      const quantity        = Number(stock.quantity.toString());
      const reservedQty     = Number(stock.reservedQuantity.toString());
      const availableStock  = Math.max(0, quantity - reservedQty);
      const cost            = Number(stock.product.cost.toString());
      const minQuantity     = stock.minQuantity != null ? Number(stock.minQuantity.toString()) : null;

      const totalSold       = salesMap.get(key) ?? 0;
      const avgDailySales   = totalSold / days;

      // Days until stock-out
      let daysUntilStockOut: number | null = null;
      if (avgDailySales > 0) {
        daysUntilStockOut = availableStock / avgDailySales;
      }

      // Risk level
      let riskLevel: StockRiskLevel;
      if (avgDailySales === 0) {
        riskLevel = 'no_data';
      } else if (daysUntilStockOut !== null && daysUntilStockOut < safetyStockDays) {
        riskLevel = 'critical';
      } else if (daysUntilStockOut !== null && daysUntilStockOut < safetyStockDays * 2) {
        riskLevel = 'warning';
      } else {
        riskLevel = 'ok';
      }

      // Purchase recommendation
      // Target stock = sales for (leadTime + safetyStock) days
      const leadTimeDays   = stock.product.leadTimeDays ?? safetyStockDays;
      const targetDays     = leadTimeDays + safetyStockDays;
      const targetStock    = avgDailySales * targetDays;
      const recommendedQty = Math.max(0, Math.ceil(targetStock - availableStock));
      const estimatedCost  = recommendedQty * cost;

      // Dead stock
      const lastSaleDate      = lastSaleMap.get(key) ?? null;
      const daysSinceLastSale = lastSaleDate
        ? Math.floor((now - lastSaleDate.getTime()) / (24 * 60 * 60 * 1000))
        : null;
      const isDeadStock = availableStock > 0 && (
        lastSaleDate === null || lastSaleDate < deadStockFrom
      );

      // Immobilized capital
      const immobilizedValue = availableStock * cost;

      return {
        productId:         stock.productId,
        productName:       stock.product.name,
        sku:               stock.product.sku,
        warehouseId:       stock.warehouseId,
        warehouseName:     stock.warehouse.name,
        categoryName:      stock.product.category?.name ?? null,

        quantity,
        reservedQuantity:  reservedQty,
        availableStock,
        minQuantity,
        cost,

        totalSoldInWindow: totalSold,
        avgDailySales,
        windowDays:        days,

        daysUntilStockOut,
        riskLevel,

        leadTimeDays,
        recommendedQty,
        estimatedCost,

        lastSaleDate:      lastSaleDate?.toISOString() ?? null,
        daysSinceLastSale,
        isDeadStock,

        immobilizedValue,
      };
    });

    // ── 6. Summary aggregates ─────────────────────────────────────────────────
    const criticalCount    = insights.filter((i) => i.riskLevel === 'critical').length;
    const warningCount     = insights.filter((i) => i.riskLevel === 'warning').length;
    const deadStockCount   = insights.filter((i) => i.isDeadStock).length;
    const totalCapital     = insights.reduce((sum, i) => sum + i.immobilizedValue, 0);
    const deadStockCapital = insights
      .filter((i) => i.isDeadStock)
      .reduce((sum, i) => sum + i.immobilizedValue, 0);

    return {
      criticalCount,
      warningCount,
      deadStockCount,
      totalCapital,
      deadStockCapital,
      insights,
    };
  }
}
