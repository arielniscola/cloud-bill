-- Vincula cheques a una Orden de Pago (endoso de terceros + cheques propios emitidos)
ALTER TABLE "cheques" ADD COLUMN IF NOT EXISTS "ordenPagoId" TEXT;
CREATE INDEX IF NOT EXISTS "idx_cheques_ordenPagoId" ON "cheques"("ordenPagoId");
