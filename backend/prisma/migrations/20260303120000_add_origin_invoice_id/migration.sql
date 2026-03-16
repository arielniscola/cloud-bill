-- Add originInvoiceId to invoices for NC/ND linking
ALTER TABLE "invoices" ADD COLUMN "originInvoiceId" TEXT;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_originInvoiceId_fkey"
  FOREIGN KEY ("originInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
