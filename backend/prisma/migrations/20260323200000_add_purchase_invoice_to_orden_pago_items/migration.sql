ALTER TABLE "orden_pago_items"
  ADD COLUMN IF NOT EXISTS "purchaseInvoiceId" TEXT REFERENCES "purchase_invoices"(id) ON DELETE SET NULL;
