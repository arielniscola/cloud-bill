CREATE TABLE "orden_compras" (
  "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "number"       TEXT NOT NULL UNIQUE,
  "supplierId"   TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "date"         TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "expectedDate" TIMESTAMP(3),
  "subtotal"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxAmount"    DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total"        DECIMAL(12,2) NOT NULL DEFAULT 0,
  "currency"     TEXT NOT NULL DEFAULT 'ARS',
  "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1,
  "status"       TEXT NOT NULL DEFAULT 'DRAFT',
  "warehouseId"  TEXT,
  "notes"        TEXT,
  "purchaseId"   TEXT UNIQUE,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "orden_compras_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id"),
  CONSTRAINT "orden_compras_userId_fkey"     FOREIGN KEY ("userId")     REFERENCES "users"("id"),
  CONSTRAINT "orden_compras_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id"),
  CONSTRAINT "orden_compras_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id")
);

CREATE TABLE "orden_compra_items" (
  "id"            TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "ordenCompraId" TEXT NOT NULL,
  "productId"     TEXT,
  "description"   TEXT NOT NULL,
  "quantity"      DECIMAL(10,2) NOT NULL,
  "unitPrice"     DECIMAL(12,2) NOT NULL,
  "taxRate"       DECIMAL(5,2)  NOT NULL DEFAULT 21,
  "subtotal"      DECIMAL(12,2) NOT NULL,
  "taxAmount"     DECIMAL(12,2) NOT NULL,
  "total"         DECIMAL(12,2) NOT NULL,
  CONSTRAINT "orden_compra_items_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "orden_compras"("id") ON DELETE CASCADE,
  CONSTRAINT "orden_compra_items_productId_fkey"     FOREIGN KEY ("productId")     REFERENCES "products"("id")
);

CREATE INDEX "orden_compras_supplierId_idx" ON "orden_compras"("supplierId");
CREATE INDEX "orden_compras_status_idx"     ON "orden_compras"("status");
CREATE INDEX "orden_compras_date_idx"       ON "orden_compras"("date");
