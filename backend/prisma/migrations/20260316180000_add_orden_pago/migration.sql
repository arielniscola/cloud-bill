-- Add payment tracking columns to purchases
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "paidAmount"    DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "saleCondition" TEXT NOT NULL DEFAULT 'CONTADO';

-- Create orden_pagos table
CREATE TABLE IF NOT EXISTS "orden_pagos" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "number"         TEXT NOT NULL UNIQUE,
  "supplierId"     TEXT NOT NULL REFERENCES "suppliers"("id"),
  "userId"         TEXT NOT NULL REFERENCES "users"("id"),
  "cashRegisterId" TEXT REFERENCES "cash_registers"("id"),
  "companyId"      TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  "date"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amount"         DECIMAL(12,2) NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'ARS',
  "exchangeRate"   DECIMAL(12,6) NOT NULL DEFAULT 1,
  "paymentMethod"  TEXT NOT NULL,
  "reference"      TEXT,
  "bank"           TEXT,
  "checkDueDate"   TIMESTAMP(3),
  "notes"          TEXT,
  "status"         TEXT NOT NULL DEFAULT 'EMITTED',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create orden_pago_items table
CREATE TABLE IF NOT EXISTS "orden_pago_items" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "ordenPagoId" TEXT NOT NULL REFERENCES "orden_pagos"("id") ON DELETE CASCADE,
  "purchaseId"  TEXT NOT NULL REFERENCES "purchases"("id"),
  "amount"      DECIMAL(12,2) NOT NULL
);

-- Create supplier_account_movements table
CREATE TABLE IF NOT EXISTS "supplier_account_movements" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "supplierId"  TEXT NOT NULL REFERENCES "suppliers"("id"),
  "ordenPagoId" TEXT UNIQUE REFERENCES "orden_pagos"("id"),
  "purchaseId"  TEXT REFERENCES "purchases"("id"),
  "type"        TEXT NOT NULL,   -- DEBIT (owe supplier) | CREDIT (paid supplier)
  "amount"      DECIMAL(12,2) NOT NULL,
  "currency"    TEXT NOT NULL DEFAULT 'ARS',
  "balance"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "description" TEXT,
  "companyId"   TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "orden_pagos_supplierId_idx"    ON "orden_pagos"("supplierId");
CREATE INDEX IF NOT EXISTS "orden_pagos_companyId_idx"     ON "orden_pagos"("companyId");
CREATE INDEX IF NOT EXISTS "orden_pago_items_opId_idx"     ON "orden_pago_items"("ordenPagoId");
CREATE INDEX IF NOT EXISTS "supplier_acct_suppId_idx"      ON "supplier_account_movements"("supplierId");
CREATE INDEX IF NOT EXISTS "supplier_acct_companyId_idx"   ON "supplier_account_movements"("companyId");
CREATE INDEX IF NOT EXISTS "supplier_acct_purchaseId_idx"  ON "supplier_account_movements"("purchaseId");
