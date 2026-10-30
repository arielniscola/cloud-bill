-- Recepción de mercadería con confirmación: lo que carga un usuario de depósito
-- (WAREHOUSE_CLERK) queda en status PENDING_CONFIRMATION sin tocar el stock;
-- un admin la confirma (puede corregir cantidad, lote y vencimiento → recién
-- ahí entra el stock) o la rechaza (REJECTED, no pasa nada).
-- status: RECEIVED | INVOICED | CANCELLED | PENDING_CONFIRMATION | REJECTED
ALTER TABLE "purchase_remitos" ADD COLUMN IF NOT EXISTS "confirmedById"   TEXT;
ALTER TABLE "purchase_remitos" ADD COLUMN IF NOT EXISTS "confirmedAt"     TIMESTAMP(3);
ALTER TABLE "purchase_remitos" ADD COLUMN IF NOT EXISTS "rejectedById"    TEXT;
ALTER TABLE "purchase_remitos" ADD COLUMN IF NOT EXISTS "rejectedAt"      TIMESTAMP(3);
ALTER TABLE "purchase_remitos" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

-- Lo que cargó el depósito, para comparar con lo que confirmó el admin
-- (quantity / lotNumber / expiresAt quedan con lo confirmado). NULL en los
-- remitos que entraron directo.
ALTER TABLE "purchase_remito_items" ADD COLUMN IF NOT EXISTS "receivedQuantity"  DECIMAL(10,2);
ALTER TABLE "purchase_remito_items" ADD COLUMN IF NOT EXISTS "receivedLotNumber" TEXT;
ALTER TABLE "purchase_remito_items" ADD COLUMN IF NOT EXISTS "receivedExpiresAt" DATE;
