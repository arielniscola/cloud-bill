-- Add budgetId to account_movements
ALTER TABLE "account_movements" ADD COLUMN "budgetId" TEXT;
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
