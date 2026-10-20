-- Facturación de remitos: varios remitos libres (sin documento de origen) del
-- mismo cliente se facturan juntos en una factura. "billedInvoiceId" apunta a
-- esa factura; es distinto de "invoiceId", que marca el remito NACIDO de una
-- factura (y por lo tanto no movió stock propio).
ALTER TABLE "remitos" ADD COLUMN IF NOT EXISTS "billedInvoiceId" TEXT;

ALTER TABLE "remitos" ADD CONSTRAINT "remitos_billedInvoiceId_fkey"
  FOREIGN KEY ("billedInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_remitos_billed_invoice" ON "remitos"("billedInvoiceId");
