-- Formato de impresión del comprobante de retiro / ingreso de caja:
-- 'A4' (original + duplicado en una hoja) o 'THERMAL_80MM' (ticket).
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "printFormatCashMovement" TEXT NOT NULL DEFAULT 'A4';
