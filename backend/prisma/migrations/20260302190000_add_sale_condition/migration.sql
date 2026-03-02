-- AddColumn saleCondition to invoices and budgets
-- CONTADO = venta al contado (no genera movimiento en cuenta corriente)
-- CUENTA_CORRIENTE = venta en cuenta corriente (genera movimiento en cuenta corriente)
ALTER TABLE "invoices" ADD COLUMN "saleCondition" TEXT NOT NULL DEFAULT 'CONTADO';
ALTER TABLE "budgets"  ADD COLUMN "saleCondition" TEXT NOT NULL DEFAULT 'CONTADO';
