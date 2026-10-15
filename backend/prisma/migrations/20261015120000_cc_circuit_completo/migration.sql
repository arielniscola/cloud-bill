-- Circuito de cuentas corrientes completo (revisión 2026-10-15).
--
-- 1) Recibos de cliente:
--    - "discountAmount" (descuento cedido) e "interestAmount" (recargo) al cobrar:
--      lo aplicado a la factura es amount + discountAmount - interestAmount.
--    - Recibo de COMPENSACIÓN: aplica un crédito existente del cliente a una
--      factura sin mover caja ni banco. El crédito de origen es una nota de
--      crédito ("creditInvoiceId") o un movimiento CREDIT de la cuenta corriente
--      ("creditMovementId": NC interna o pago a cuenta).
-- 2) account_movements."sourceReciboId": movimientos accesorios de un recibo
--    (descuento cedido / recargo). "reciboId" es único y queda para el cobro.
-- 3) supplier_account_movements."ordenPagoAjusteId": movimiento propio de cada
--    ajuste de una OP (descuento obtenido / interés).
-- 4) Backfill de (3) para las OP ya pagadas: antes el ajuste solo neteaba el
--    CREDIT del pago y la factura quedaba PAID con deuda huérfana en la CC.

ALTER TABLE "recibos"
  ADD COLUMN IF NOT EXISTS "discountAmount"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "interestAmount"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "creditInvoiceId"  TEXT,
  ADD COLUMN IF NOT EXISTS "creditMovementId" TEXT;

CREATE INDEX IF NOT EXISTS "idx_recibos_credit_invoice"  ON "recibos" ("creditInvoiceId")  WHERE "creditInvoiceId"  IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_recibos_credit_movement" ON "recibos" ("creditMovementId") WHERE "creditMovementId" IS NOT NULL;

ALTER TABLE "account_movements"
  ADD COLUMN IF NOT EXISTS "sourceReciboId" TEXT;
CREATE INDEX IF NOT EXISTS "idx_account_movements_source_recibo" ON "account_movements" ("sourceReciboId") WHERE "sourceReciboId" IS NOT NULL;

ALTER TABLE "supplier_account_movements"
  ADD COLUMN IF NOT EXISTS "ordenPagoAjusteId" TEXT;
CREATE INDEX IF NOT EXISTS "idx_sam_orden_pago_ajuste" ON "supplier_account_movements" ("ordenPagoAjusteId") WHERE "ordenPagoAjusteId" IS NOT NULL;

-- Backfill: OP pagadas, con facturas, que ya generaron su movimiento de cuenta
-- corriente (el pago), y cuyos ajustes todavía no tienen movimiento propio.
-- El saldo corrido ("balance") se recalcula al leer el extracto.
INSERT INTO "supplier_account_movements"
  ("id", "supplierId", "ordenPagoId", "ordenPagoAjusteId", "type", "amount", "currency",
   "balance", "description", "companyId", "fiscalMode", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text, op."supplierId", op.id, a.id,
  CASE WHEN a.type = 'RESTA' THEN 'CREDIT' ELSE 'DEBIT' END,
  a.amount, op.currency, 0,
  CASE WHEN a.type = 'RESTA' THEN 'Descuento obtenido: ' ELSE 'Interés/recargo: ' END
    || a.description || ' (' || op.number || ')',
  op."companyId", COALESCE(op."fiscalMode", 'FORMAL'), pay."createdAt", NOW()
FROM "orden_pago_ajustes" a
JOIN "orden_pagos" op ON op.id = a."ordenPagoId"
JOIN LATERAL (
  SELECT MIN(sam."createdAt") AS "createdAt"
  FROM "supplier_account_movements" sam
  WHERE sam."ordenPagoId" = op.id AND sam."internalNoteId" IS NULL
) pay ON pay."createdAt" IS NOT NULL
WHERE op.status = 'PAID'
  AND EXISTS (SELECT 1 FROM "orden_pago_items" i WHERE i."ordenPagoId" = op.id)
  AND NOT EXISTS (
    SELECT 1 FROM "supplier_account_movements" x WHERE x."ordenPagoAjusteId" = a.id
  );
