-- Factura de proveedor pasa a ser un DOCUMENTO DE PRIMER NIVEL (standalone).
--   * El stock lo maneja EXCLUSIVAMENTE el remito de compra.
--   * La factura refleja lo que se debe pagar al proveedor (genera cuenta corriente).
--   * La "Compra" (purchases) se retira del flujo; queda como legacy.
-- Sin datos productivos: el backfill es best-effort para no perder lo poco que haya.

-- ── 1. Nuevas columnas en purchase_invoices ────────────────────────────────────
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "supplierId"    TEXT;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "currency"      TEXT NOT NULL DEFAULT 'ARS';
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "saleCondition" TEXT NOT NULL DEFAULT 'CONTADO';
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "exchangeRate"  DECIMAL(12,4) NOT NULL DEFAULT 1;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "date"          TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- ── 2. purchaseId pasa a OPCIONAL (legacy). FK CASCADE → SET NULL ───────────────
ALTER TABLE "purchase_invoices" ALTER COLUMN "purchaseId" DROP NOT NULL;
ALTER TABLE "purchase_invoices" DROP CONSTRAINT IF EXISTS "purchase_invoices_purchaseId_fkey";
ALTER TABLE "purchase_invoices" ADD  CONSTRAINT "purchase_invoices_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL;

-- ── 3. FK supplierId + índice ──────────────────────────────────────────────────
ALTER TABLE "purchase_invoices" DROP CONSTRAINT IF EXISTS "purchase_invoices_supplierId_fkey";
ALTER TABLE "purchase_invoices" ADD  CONSTRAINT "purchase_invoices_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS "purchase_invoices_supplierId_idx" ON "purchase_invoices"("supplierId");

-- ── 4. Backfill supplier / currency / saleCondition / fecha desde la compra ─────
UPDATE "purchase_invoices" pi
SET "supplierId"    = p."supplierId",
    "currency"      = p.currency::text,
    "saleCondition" = COALESCE(p."saleCondition", 'CONTADO'),
    "exchangeRate"  = COALESCE(p."exchangeRate", 1),
    "date"          = p.date
FROM "purchases" p
WHERE pi."purchaseId" = p.id AND pi."supplierId" IS NULL;

-- ── 5. Migrar items de la compra → items de la factura ─────────────────────────
-- Solo cuando la compra tiene UNA sola factura y esa factura no tiene items propios.
INSERT INTO "purchase_invoice_items"
  (id, "purchaseInvoiceId", description, quantity, "unitPrice", "taxRate", subtotal, "taxAmount", total)
SELECT gen_random_uuid()::text, pi.id, it.description, it.quantity, it."unitPrice",
       it."taxRate", it.subtotal, it."taxAmount", it.total
FROM "purchase_items" it
JOIN "purchase_invoices" pi ON pi."purchaseId" = it."purchaseId"
WHERE (SELECT COUNT(*) FROM "purchase_invoices" x WHERE x."purchaseId" = it."purchaseId") = 1
  AND NOT EXISTS (SELECT 1 FROM "purchase_invoice_items" y WHERE y."purchaseInvoiceId" = pi.id);

-- ── 6. Tabla puente factura ↔ remito(s) de compra ──────────────────────────────
CREATE TABLE IF NOT EXISTS "purchase_invoice_remitos" (
  "purchaseInvoiceId" TEXT NOT NULL,
  "remitoId"          TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_invoice_remitos_pkey" PRIMARY KEY ("purchaseInvoiceId", "remitoId"),
  CONSTRAINT "pir_invoice_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE,
  CONSTRAINT "pir_remito_fkey"  FOREIGN KEY ("remitoId")          REFERENCES "purchase_remitos"("id")  ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "pir_remito_idx" ON "purchase_invoice_remitos"("remitoId");

-- ── 7. orden_pago_items.purchaseId pasa a OPCIONAL ─────────────────────────────
-- Una orden de pago cancela facturas; la factura puede no tener compra asociada.
ALTER TABLE "orden_pago_items" ALTER COLUMN "purchaseId" DROP NOT NULL;

-- Nota: purchase_invoices."supplierId" se deja NULLABLE a nivel físico para tolerar
-- facturas legacy huérfanas; la aplicación lo exige en las facturas nuevas.
