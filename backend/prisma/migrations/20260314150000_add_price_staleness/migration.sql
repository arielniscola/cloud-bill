-- Add price staleness warning thresholds to app_settings
ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "stalePriceWarnDays1" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "stalePriceWarnDays2" INTEGER NOT NULL DEFAULT 20;

-- Add priceUpdatedAt to products (NULL = never updated via edit, backend sets it on price change)
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "priceUpdatedAt" TIMESTAMP(3) DEFAULT NULL;
