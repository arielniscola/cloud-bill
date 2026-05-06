-- Variantes en items de documentos: invoice, budget, orden_pedido, remito.
-- variantId nullable: items existentes mantienen variantId = NULL.

-- ── invoice_items ─────────────────────────────────────────────────────────
ALTER TABLE "invoice_items"
  ADD COLUMN IF NOT EXISTS "variantId" TEXT NULL;

ALTER TABLE "invoice_items"
  ADD CONSTRAINT "invoice_items_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "invoice_items_variantId_idx"
  ON "invoice_items" ("variantId");

-- ── budget_items ──────────────────────────────────────────────────────────
ALTER TABLE "budget_items"
  ADD COLUMN IF NOT EXISTS "variantId" TEXT NULL;

ALTER TABLE "budget_items"
  ADD CONSTRAINT "budget_items_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "budget_items_variantId_idx"
  ON "budget_items" ("variantId");

-- ── orden_pedido_items ────────────────────────────────────────────────────
ALTER TABLE "orden_pedido_items"
  ADD COLUMN IF NOT EXISTS "variantId" TEXT NULL;

ALTER TABLE "orden_pedido_items"
  ADD CONSTRAINT "orden_pedido_items_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "orden_pedido_items_variantId_idx"
  ON "orden_pedido_items" ("variantId");

-- ── remito_items ──────────────────────────────────────────────────────────
ALTER TABLE "remito_items"
  ADD COLUMN IF NOT EXISTS "variantId" TEXT NULL;

ALTER TABLE "remito_items"
  ADD CONSTRAINT "remito_items_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "remito_items_variantId_idx"
  ON "remito_items" ("variantId");
