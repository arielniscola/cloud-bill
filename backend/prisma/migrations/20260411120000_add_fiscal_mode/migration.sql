-- Agregar campo fiscalMode a todas las tablas transaccionales
-- Valores: 'FORMAL' (operaciones declaradas) | 'INFORMAL' (operaciones no informadas)
-- Todo lo existente queda como FORMAL por default

-- Ventas
ALTER TABLE "invoices"       ADD COLUMN "fiscalMode" TEXT NOT NULL DEFAULT 'FORMAL';
ALTER TABLE "budgets"        ADD COLUMN "fiscalMode" TEXT NOT NULL DEFAULT 'FORMAL';
ALTER TABLE "orden_pedidos"  ADD COLUMN "fiscalMode" TEXT NOT NULL DEFAULT 'FORMAL';
ALTER TABLE "remitos"        ADD COLUMN "fiscalMode" TEXT NOT NULL DEFAULT 'FORMAL';
ALTER TABLE "recibos"        ADD COLUMN "fiscalMode" TEXT NOT NULL DEFAULT 'FORMAL';

-- Compras
ALTER TABLE "purchases"          ADD COLUMN "fiscalMode" TEXT NOT NULL DEFAULT 'FORMAL';
ALTER TABLE "purchase_invoices"  ADD COLUMN "fiscalMode" TEXT NOT NULL DEFAULT 'FORMAL';
ALTER TABLE "orden_compras"      ADD COLUMN "fiscalMode" TEXT NOT NULL DEFAULT 'FORMAL';
ALTER TABLE "orden_pagos"        ADD COLUMN "fiscalMode" TEXT NOT NULL DEFAULT 'FORMAL';

-- Movimientos
ALTER TABLE "account_movements"            ADD COLUMN "fiscalMode" TEXT NOT NULL DEFAULT 'FORMAL';
ALTER TABLE "supplier_account_movements"   ADD COLUMN "fiscalMode" TEXT NOT NULL DEFAULT 'FORMAL';
ALTER TABLE "stock_movements"              ADD COLUMN "fiscalMode" TEXT NOT NULL DEFAULT 'FORMAL';

-- Cuentas corrientes: necesitan separarse por modo fiscal
-- Cada cliente tendrá una CC formal y una informal por moneda
ALTER TABLE "current_accounts" ADD COLUMN "fiscalMode" TEXT NOT NULL DEFAULT 'FORMAL';
DROP INDEX IF EXISTS "current_accounts_customerId_currency_key";
ALTER TABLE "current_accounts" DROP CONSTRAINT IF EXISTS "current_accounts_customerId_currency_key";
CREATE UNIQUE INDEX "current_accounts_customerId_currency_fiscalMode_key"
  ON "current_accounts"("customerId", "currency", "fiscalMode");

-- Índices para filtrado rápido en tablas de alto volumen
CREATE INDEX "idx_invoices_fiscalMode"      ON "invoices"("fiscalMode");
CREATE INDEX "idx_purchases_fiscalMode"     ON "purchases"("fiscalMode");
CREATE INDEX "idx_recibos_fiscalMode"       ON "recibos"("fiscalMode");
CREATE INDEX "idx_account_movements_fiscal" ON "account_movements"("fiscalMode");
CREATE INDEX "idx_stock_movements_fiscal"   ON "stock_movements"("fiscalMode");
