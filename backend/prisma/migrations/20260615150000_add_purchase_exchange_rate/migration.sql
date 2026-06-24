-- Cotización editable en compras (USD → ARS)
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1;
