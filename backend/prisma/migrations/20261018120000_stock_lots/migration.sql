-- Lotes y vencimientos.
--
-- `stocks.quantity` sigue siendo el total por (producto, variante, depósito);
-- para los productos con `trackLots` ese total es la suma de sus lotes.

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "trackLots" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "stock_lots" (
  "id"          TEXT NOT NULL,
  "productId"   TEXT NOT NULL,
  "variantId"   TEXT,
  "warehouseId" TEXT NOT NULL,
  "lotNumber"   TEXT NOT NULL,
  "expiresAt"   DATE,
  "quantity"    DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_lots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_lots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stock_lots_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stock_lots_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Un número de lote es único por producto/variante/depósito (variante NULL incluida).
CREATE UNIQUE INDEX IF NOT EXISTS "stock_lots_unique_number"
  ON "stock_lots" ("productId", COALESCE("variantId", ''), "warehouseId", "lotNumber");
CREATE INDEX IF NOT EXISTS "idx_stock_lots_expires" ON "stock_lots" ("expiresAt");
CREATE INDEX IF NOT EXISTS "idx_stock_lots_warehouse" ON "stock_lots" ("warehouseId");

-- Qué lote(s) tocó cada movimiento de stock. Es la fuente de la trazabilidad.
CREATE TABLE IF NOT EXISTS "stock_movement_lots" (
  "id"         TEXT NOT NULL,
  "movementId" TEXT NOT NULL,
  "lotId"      TEXT NOT NULL,
  "quantity"   DECIMAL(10, 2) NOT NULL,
  CONSTRAINT "stock_movement_lots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_movement_lots_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "stock_movements"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stock_movement_lots_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "stock_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_stock_movement_lots_movement" ON "stock_movement_lots" ("movementId");
CREATE INDEX IF NOT EXISTS "idx_stock_movement_lots_lot" ON "stock_movement_lots" ("lotId");

-- Lotes elegidos en el comprobante, hasta que el stock se mueva:
-- [{ "productId", "variantId", "lots": [{ "lotId", "quantity" }] }]
ALTER TABLE "invoices"      ADD COLUMN IF NOT EXISTS "lotSelections" JSONB;
ALTER TABLE "remitos"       ADD COLUMN IF NOT EXISTS "lotSelections" JSONB;
ALTER TABLE "orden_pedidos" ADD COLUMN IF NOT EXISTS "lotSelections" JSONB;

-- Remito de compra: lote y vencimiento de lo que entra, por línea.
ALTER TABLE "purchase_remito_items" ADD COLUMN IF NOT EXISTS "lotNumber" TEXT;
ALTER TABLE "purchase_remito_items" ADD COLUMN IF NOT EXISTS "expiresAt" DATE;
