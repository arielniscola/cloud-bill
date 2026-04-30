-- Restore purchaseInvoiceId column that was accidentally dropped by add_cards migration
ALTER TABLE "orden_pago_items"
  ADD COLUMN IF NOT EXISTS "purchaseInvoiceId" TEXT;

-- FK to purchase_invoices
ALTER TABLE "orden_pago_items"
  ADD CONSTRAINT "orden_pago_items_purchaseInvoiceId_fkey"
  FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
