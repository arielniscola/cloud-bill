-- Link supplier account movements to a purchase invoice (for retenciones/percepciones)
-- ON DELETE CASCADE: deleting a purchase invoice removes its account movements.
ALTER TABLE "supplier_account_movements" ADD COLUMN IF NOT EXISTS "purchaseInvoiceId" TEXT;

ALTER TABLE "supplier_account_movements" DROP CONSTRAINT IF EXISTS "supplier_account_movements_purchaseInvoiceId_fkey";
ALTER TABLE "supplier_account_movements" ADD CONSTRAINT "supplier_account_movements_purchaseInvoiceId_fkey"
  FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_sam_purchaseInvoiceId"
  ON "supplier_account_movements" ("purchaseInvoiceId");
