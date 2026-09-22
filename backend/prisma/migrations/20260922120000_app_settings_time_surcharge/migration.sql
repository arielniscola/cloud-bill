-- Recargo por horario: dentro de la ventana [From, To) los precios de venta se
-- cargan con un porcentaje extra. Es SOLO un recargo de venta: no toca el
-- precio de lista del producto. La ventana puede cruzar la medianoche
-- (ej. 20:00 -> 02:00). Por defecto queda apagado.
ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "timeSurchargeEnabled" BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "timeSurchargeFrom"    TEXT          NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS "timeSurchargeTo"      TEXT          NOT NULL DEFAULT '23:59',
  ADD COLUMN IF NOT EXISTS "timeSurchargePct"     DECIMAL(6,2)  NOT NULL DEFAULT 0;
