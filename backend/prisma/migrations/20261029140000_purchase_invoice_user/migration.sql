-- Quién cargó la factura de compra. Es el comprobante que genera deuda con el
-- proveedor y no tenía autor. Las facturas anteriores quedan en NULL.
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "userId" TEXT;

DO $$ BEGIN
  ALTER TABLE "purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
