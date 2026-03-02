-- AlterTable: add type column to budgets with default FACTURA_B
ALTER TABLE "budgets" ADD COLUMN "type" "InvoiceType" NOT NULL DEFAULT 'FACTURA_B';
