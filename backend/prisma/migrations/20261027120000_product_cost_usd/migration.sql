-- Costo en dólares del producto. Cuando está cargado, `cost` (pesos) se deriva
-- de él: se convierte con la cotización del día al cargarlo/cambiarlo, y se
-- vuelve a convertir A MANO con "Recalcular costos USD" cuando cambia el dólar
-- (POST /products/recalculate-usd-costs). `costUsdRate` guarda la cotización
-- con la que se calculó el costo en pesos vigente.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "costUSD" DECIMAL(12,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "costUsdRate" DECIMAL(12,4);
