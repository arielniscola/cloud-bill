CREATE TABLE "invoice_afip_errors" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "invoiceId"    TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "errorMessage" TEXT NOT NULL,
  "errorType"    TEXT,
  "rawResponse"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE
);

CREATE INDEX "invoice_afip_errors_invoiceId_idx" ON "invoice_afip_errors"("invoiceId");
