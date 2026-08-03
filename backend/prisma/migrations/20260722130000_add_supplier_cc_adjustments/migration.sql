-- Imputación manual de cuenta corriente de proveedores: permite cerrar
-- facturas/ND pendientes contra NC o pagos a cuenta sueltos, sin pasar por
-- una Orden de Pago. Si queda una diferencia chica, se registra como
-- "manualAmount" y genera UN movimiento nuevo en supplier_account_movements
-- (la imputación entre comprobantes existentes no genera movimiento: ya
-- está reflejada en el saldo agregado).
CREATE TABLE IF NOT EXISTS "supplier_cc_adjustments" (
  "id"           TEXT NOT NULL,
  "supplierId"   TEXT NOT NULL,
  "companyId"    TEXT NOT NULL,
  "fiscalMode"   TEXT,
  "currency"     TEXT NOT NULL DEFAULT 'ARS',
  "manualAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "description"  TEXT,
  "userId"       TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_cc_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_cc_adjustments_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Ítems del ajuste: qué comprobante (factura/ND=DEBIT, NC/pago a cuenta=CREDIT)
-- fue cubierto y por cuánto. purchaseInvoiceId/movementId quedan NULL cuando
-- el ítem corresponde a la porción "manualAmount" (sin comprobante que lo respalde).
CREATE TABLE IF NOT EXISTS "supplier_cc_adjustment_items" (
  "id"                TEXT NOT NULL,
  "adjustmentId"      TEXT NOT NULL,
  "side"              TEXT NOT NULL,   -- DEBIT | CREDIT
  "purchaseInvoiceId" TEXT,
  "movementId"        TEXT,
  "amount"            DECIMAL(14,2) NOT NULL,
  CONSTRAINT "supplier_cc_adjustment_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_cc_adjustment_items_adjustmentId_fkey"
    FOREIGN KEY ("adjustmentId") REFERENCES "supplier_cc_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Marca el movimiento de cuenta corriente generado por la porción "manualAmount"
-- de un ajuste, para poder clasificarlo como kind ADJUSTMENT en el ledger.
ALTER TABLE "supplier_account_movements" ADD COLUMN IF NOT EXISTS "adjustmentId" TEXT;

CREATE INDEX IF NOT EXISTS "supplier_cc_adjustments_supplierId_idx" ON "supplier_cc_adjustments"("supplierId");
CREATE INDEX IF NOT EXISTS "supplier_cc_adjustment_items_adjustmentId_idx" ON "supplier_cc_adjustment_items"("adjustmentId");
CREATE INDEX IF NOT EXISTS "supplier_account_movements_adjustmentId_idx" ON "supplier_account_movements"("adjustmentId");
