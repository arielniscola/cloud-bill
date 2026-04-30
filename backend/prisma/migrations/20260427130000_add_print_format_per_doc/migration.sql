-- Per-document-type print format (A4 | THERMAL_80MM). Default to current global printFormat.

ALTER TABLE "app_settings"
  ADD COLUMN "printFormatInvoice"     TEXT NOT NULL DEFAULT 'A4',
  ADD COLUMN "printFormatBudget"      TEXT NOT NULL DEFAULT 'A4',
  ADD COLUMN "printFormatOrdenPedido" TEXT NOT NULL DEFAULT 'THERMAL_80MM',
  ADD COLUMN "printFormatRemito"      TEXT NOT NULL DEFAULT 'A4',
  ADD COLUMN "printFormatRecibo"      TEXT NOT NULL DEFAULT 'A4';

-- Backfill from existing global printFormat so the rollout is non-breaking
UPDATE "app_settings" SET
  "printFormatInvoice"     = COALESCE("printFormat", 'A4'),
  "printFormatBudget"      = COALESCE("printFormat", 'A4'),
  "printFormatOrdenPedido" = COALESCE("printFormat", 'THERMAL_80MM'),
  "printFormatRemito"      = COALESCE("printFormat", 'A4'),
  "printFormatRecibo"      = COALESCE("printFormat", 'A4');
