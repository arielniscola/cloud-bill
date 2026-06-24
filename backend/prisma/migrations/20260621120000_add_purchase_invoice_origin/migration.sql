-- Vincula NC/ND de compra a la factura de proveedor de origen (trazabilidad,
-- igual que invoices.originInvoiceId en ventas).
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "originInvoiceId" TEXT;

ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_originInvoiceId_fkey"
  FOREIGN KEY ("originInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
