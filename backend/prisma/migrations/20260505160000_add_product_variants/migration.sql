-- Variantes de producto (talle, color, etc.)
-- Un producto con variantes activas tiene su stock y precio gestionado a nivel variante.
CREATE TABLE IF NOT EXISTS "product_variants" (
  "id"             TEXT          NOT NULL PRIMARY KEY,
  "productId"      TEXT          NOT NULL,
  "sku"            TEXT          NOT NULL,
  "name"           TEXT          NOT NULL,
  "attributes"     JSONB         NOT NULL DEFAULT '{}'::jsonb,
  "priceOverride"  DECIMAL(12,2),
  "costOverride"   DECIMAL(12,2),
  "barcode"        TEXT,
  "isActive"       BOOLEAN       NOT NULL DEFAULT true,
  "companyId"      TEXT          NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_variants_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_companyId_sku_key"
  ON "product_variants" ("companyId", "sku");

CREATE INDEX IF NOT EXISTS "product_variants_productId_idx"
  ON "product_variants" ("productId");
