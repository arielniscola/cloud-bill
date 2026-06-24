-- Remito de compra / Recepción de mercadería (recibir sin facturar, luego facturar)
CREATE TABLE IF NOT EXISTS "purchase_remitos" (
  "id"          TEXT          NOT NULL,
  "number"      TEXT          NOT NULL,
  "supplierId"  TEXT          NOT NULL,
  "userId"      TEXT          NOT NULL,
  "warehouseId" TEXT          NOT NULL,
  "date"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"      TEXT          NOT NULL DEFAULT 'RECEIVED', -- RECEIVED | INVOICED | CANCELLED
  "notes"       TEXT,
  "purchaseId"  TEXT,
  "companyId"   TEXT          NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  "fiscalMode"  TEXT          NOT NULL DEFAULT 'FORMAL',
  "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_remitos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_remitos_supplierId_fkey"  FOREIGN KEY ("supplierId")  REFERENCES "suppliers"("id"),
  CONSTRAINT "purchase_remitos_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id"),
  CONSTRAINT "purchase_remitos_purchaseId_fkey"  FOREIGN KEY ("purchaseId")  REFERENCES "purchases"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_purchase_remitos_companyId"  ON "purchase_remitos" ("companyId");
CREATE INDEX IF NOT EXISTS "idx_purchase_remitos_supplierId" ON "purchase_remitos" ("supplierId");
CREATE INDEX IF NOT EXISTS "idx_purchase_remitos_status"     ON "purchase_remitos" ("status");

CREATE TABLE IF NOT EXISTS "purchase_remito_items" (
  "id"          TEXT          NOT NULL,
  "remitoId"    TEXT          NOT NULL,
  "productId"   TEXT,
  "variantId"   TEXT,
  "description" TEXT          NOT NULL,
  "quantity"    DECIMAL(10,2) NOT NULL DEFAULT 0,
  "unitPrice"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_remito_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_remito_items_remitoId_fkey"
    FOREIGN KEY ("remitoId") REFERENCES "purchase_remitos"("id") ON DELETE CASCADE,
  CONSTRAINT "purchase_remito_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_purchase_remito_items_remitoId" ON "purchase_remito_items" ("remitoId");
