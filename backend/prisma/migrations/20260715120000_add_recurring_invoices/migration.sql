-- Facturación recurrente (abonos): plantillas que generan facturas en
-- borrador automáticamente según una frecuencia. La factura generada guarda
-- recurringInvoiceId para trazabilidad.
CREATE TABLE IF NOT EXISTS "recurring_invoices" (
  "id"              TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "customerId"      TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "type"            "InvoiceType" NOT NULL DEFAULT 'FACTURA_B',
  "currency"        "Currency" NOT NULL DEFAULT 'ARS',
  "exchangeRate"    DECIMAL(12,4) NOT NULL DEFAULT 1,
  "saleCondition"   TEXT NOT NULL DEFAULT 'CONTADO',
  "paymentTerms"    TEXT,
  "stockBehavior"   TEXT NOT NULL DEFAULT 'DISCOUNT',
  "warehouseId"     TEXT,
  "notes"           TEXT,
  "frequency"       TEXT NOT NULL DEFAULT 'MONTHLY',
  "dayOfMonth"      INTEGER,
  "useCurrentPrices" BOOLEAN NOT NULL DEFAULT false,
  "startDate"       TIMESTAMP(3) NOT NULL,
  "endDate"         TIMESTAMP(3),
  "nextRunAt"       TIMESTAMP(3) NOT NULL,
  "lastRunAt"       TIMESTAMP(3),
  "generatedCount"  INTEGER NOT NULL DEFAULT 0,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "companyId"       TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  "fiscalMode"      TEXT NOT NULL DEFAULT 'FORMAL',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "recurring_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "recurring_invoice_items" (
  "id"                 TEXT NOT NULL,
  "recurringInvoiceId" TEXT NOT NULL,
  "productId"          TEXT NOT NULL,
  "variantId"          TEXT,
  "quantity"           DECIMAL(10,2) NOT NULL,
  "unitPrice"          DECIMAL(12,2) NOT NULL,
  "discountPct"        DECIMAL(5,2) NOT NULL DEFAULT 0,
  "taxRate"            DECIMAL(5,2) NOT NULL DEFAULT 21,

  CONSTRAINT "recurring_invoice_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recurring_invoice_items" ADD CONSTRAINT "recurring_invoice_items_recurringInvoiceId_fkey"
  FOREIGN KEY ("recurringInvoiceId") REFERENCES "recurring_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_invoice_items" ADD CONSTRAINT "recurring_invoice_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_recurring_invoices_nextRunAt" ON "recurring_invoices"("nextRunAt");
CREATE INDEX IF NOT EXISTS "idx_recurring_invoices_companyId" ON "recurring_invoices"("companyId");

-- Trazabilidad: la factura generada apunta a su abono de origen.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "recurringInvoiceId" TEXT;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recurringInvoiceId_fkey"
  FOREIGN KEY ("recurringInvoiceId") REFERENCES "recurring_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
