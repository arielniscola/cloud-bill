-- Add optional USD sale price to products
ALTER TABLE "products" ADD COLUMN "salePriceUSD" DECIMAL(12,2);

-- Add exchange rate to recibos (for USD budget payments)
ALTER TABLE "recibos" ADD COLUMN "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1;
