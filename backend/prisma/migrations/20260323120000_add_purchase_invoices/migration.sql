-- CreateTable purchase_invoices
CREATE TABLE IF NOT EXISTS "purchase_invoices" (
  "id"            TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "purchaseId"    TEXT          NOT NULL,
  "number"        TEXT          NOT NULL,
  "type"          TEXT          NOT NULL DEFAULT 'FACTURA_A',
  "subtotal"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxRate"       DECIMAL(5,2)  NOT NULL DEFAULT 21,
  "taxAmount"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "amount"        DECIMAL(12,2) NOT NULL,
  "dueDate"       DATE,
  "paymentMethod" TEXT          NOT NULL DEFAULT 'BANK_TRANSFER',
  "status"        TEXT          NOT NULL DEFAULT 'PENDING',
  "notes"         TEXT,
  "companyId"     TEXT          NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  "createdAt"     TIMESTAMP     NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMP     NOT NULL DEFAULT NOW(),

  CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_invoices_purchaseId_fkey"
    FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "purchase_invoices_purchaseId_idx" ON "purchase_invoices"("purchaseId");
CREATE INDEX IF NOT EXISTS "purchase_invoices_dueDate_idx"    ON "purchase_invoices"("dueDate");
CREATE INDEX IF NOT EXISTS "purchase_invoices_companyId_idx"  ON "purchase_invoices"("companyId");
