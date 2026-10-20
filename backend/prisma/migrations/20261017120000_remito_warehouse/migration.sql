-- Depósito elegible en el remito libre (sin factura/OP de origen): guarda de
-- qué depósito salió la mercadería, para que la anulación devuelva el stock al
-- mismo depósito (NULL = depósito por defecto, comportamiento previo).
ALTER TABLE "remitos" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;

ALTER TABLE "remitos" ADD CONSTRAINT "remitos_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
