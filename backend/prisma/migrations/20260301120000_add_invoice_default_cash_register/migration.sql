-- AlterTable: add defaultInvoiceCashRegisterId to app_settings
ALTER TABLE "app_settings" ADD COLUMN "defaultInvoiceCashRegisterId" TEXT;

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_defaultInvoiceCashRegisterId_fkey"
  FOREIGN KEY ("defaultInvoiceCashRegisterId") REFERENCES "cash_registers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
