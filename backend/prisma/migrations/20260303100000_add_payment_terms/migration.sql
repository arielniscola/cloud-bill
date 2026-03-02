-- AddColumn paymentTerms to invoices and budgets
ALTER TABLE "invoices" ADD COLUMN "paymentTerms" TEXT;
ALTER TABLE "budgets"  ADD COLUMN "paymentTerms" TEXT;
