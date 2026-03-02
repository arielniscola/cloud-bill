-- AddColumn invoiceId and budgetId to remitos table
ALTER TABLE "remitos" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "remitos" ADD COLUMN "budgetId" TEXT;

ALTER TABLE "remitos" ADD CONSTRAINT "remitos_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "remitos" ADD CONSTRAINT "remitos_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
