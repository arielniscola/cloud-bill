-- Add discountPct to invoice_items and orden_pedido_items
ALTER TABLE "invoice_items"
  ADD COLUMN IF NOT EXISTS "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "orden_pedido_items"
  ADD COLUMN IF NOT EXISTS "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0;
