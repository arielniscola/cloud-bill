-- Retención automática por proveedor (ej. IIBB 1.5%): se autocompleta al
-- cargar una factura de ese proveedor. NULL/0 = sin retención automática.
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "retentionType" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "retentionPercentage" DECIMAL(5,2);
