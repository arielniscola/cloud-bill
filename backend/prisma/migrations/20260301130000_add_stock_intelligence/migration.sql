-- Add leadTimeDays to products (optional, per-product reorder lead time)
ALTER TABLE "products" ADD COLUMN "leadTimeDays" INTEGER;

-- Add intelligence thresholds to app_settings
ALTER TABLE "app_settings" ADD COLUMN "deadStockDays"   INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "app_settings" ADD COLUMN "safetyStockDays" INTEGER NOT NULL DEFAULT 14;
