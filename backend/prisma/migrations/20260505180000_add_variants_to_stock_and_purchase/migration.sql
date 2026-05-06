-- Variantes en stocks, movimientos y compras.
-- variantId nullable: productos sin variantes mantienen sus filas existentes con variantId = NULL.

-- ── stocks ────────────────────────────────────────────────────────────────
ALTER TABLE "stocks"
  ADD COLUMN IF NOT EXISTS "variantId" TEXT NULL;

ALTER TABLE "stocks"
  ADD CONSTRAINT "stocks_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Reemplazar unique (productId, warehouseId) por dos partial unique:
--   - sin variante: única por (productId, warehouseId) where variantId is null
--   - con variante: única por (productId, variantId, warehouseId) where variantId is not null
DROP INDEX IF EXISTS "stocks_productId_warehouseId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "stocks_no_variant_key"
  ON "stocks" ("productId", "warehouseId")
  WHERE "variantId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "stocks_variant_key"
  ON "stocks" ("productId", "variantId", "warehouseId")
  WHERE "variantId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "stocks_variantId_idx"
  ON "stocks" ("variantId");

-- ── stock_movements ───────────────────────────────────────────────────────
ALTER TABLE "stock_movements"
  ADD COLUMN IF NOT EXISTS "variantId" TEXT NULL;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "stock_movements_variantId_idx"
  ON "stock_movements" ("variantId");

-- ── purchase_items ────────────────────────────────────────────────────────
ALTER TABLE "purchase_items"
  ADD COLUMN IF NOT EXISTS "variantId" TEXT NULL;

ALTER TABLE "purchase_items"
  ADD CONSTRAINT "purchase_items_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "purchase_items_variantId_idx"
  ON "purchase_items" ("variantId");
