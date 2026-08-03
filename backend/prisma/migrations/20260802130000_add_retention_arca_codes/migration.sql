-- Códigos ARCA de la retención, necesarios para exportar el archivo de
-- importación de SICORE (RG 2233): "código de impuesto" (4 díg.) y "código de
-- régimen" (3 díg.). Se configuran por proveedor y se copian a la retención
-- practicada, para que un cambio posterior en la config no altere lo ya emitido.
--   Ganancias → impuesto 217   |   IVA → impuesto 767
--   IIBB es provincial (SIRCAR / ARBA / AGIP): no va a SICORE.
ALTER TABLE "supplier_retentions"    ADD COLUMN IF NOT EXISTS "arcaImpuesto" TEXT;
ALTER TABLE "supplier_retentions"    ADD COLUMN IF NOT EXISTS "arcaRegimen"  TEXT;
ALTER TABLE "orden_pago_retenciones" ADD COLUMN IF NOT EXISTS "arcaImpuesto" TEXT;
ALTER TABLE "orden_pago_retenciones" ADD COLUMN IF NOT EXISTS "arcaRegimen"  TEXT;

-- Backfill del código de impuesto para lo ya cargado (el régimen depende de la
-- actividad y lo tiene que completar el usuario).
UPDATE "supplier_retentions"    SET "arcaImpuesto" = '217' WHERE "arcaImpuesto" IS NULL AND "type" = 'GANANCIAS';
UPDATE "supplier_retentions"    SET "arcaImpuesto" = '767' WHERE "arcaImpuesto" IS NULL AND "type" = 'IVA';
UPDATE "orden_pago_retenciones" SET "arcaImpuesto" = '217' WHERE "arcaImpuesto" IS NULL AND "type" = 'GANANCIAS';
UPDATE "orden_pago_retenciones" SET "arcaImpuesto" = '767' WHERE "arcaImpuesto" IS NULL AND "type" = 'IVA';
