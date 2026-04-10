-- Add imputationDate to purchase_invoices
ALTER TABLE "purchase_invoices"
  ADD COLUMN IF NOT EXISTS "imputationDate" TIMESTAMP(3);
