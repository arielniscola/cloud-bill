-- SKU debe ser único por empresa, no globalmente.
-- Antes: dos empresas distintas no podían tener el mismo SKU.
DROP INDEX IF EXISTS "products_sku_key";

CREATE UNIQUE INDEX IF NOT EXISTS "products_companyId_sku_key"
  ON "products" ("companyId", "sku");
