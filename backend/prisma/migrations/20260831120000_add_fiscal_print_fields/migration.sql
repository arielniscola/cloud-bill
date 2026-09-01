-- Datos del emisor exigidos en la impresión fiscal (ticket 80mm y A4):
--   * grossIncome           → "Ingresos Brutos: XXXXXXX"
--   * consumerDefensePhone  → "Defensa del consumidor <prov> 0800-..."
-- Se replica grossIncome en companies para mantener el fallback afip_config → Company
-- que ya usan businessName / businessAddress / cuit / taxCondition.
ALTER TABLE "afip_config" ADD COLUMN IF NOT EXISTS "grossIncome" TEXT;
ALTER TABLE "afip_config" ADD COLUMN IF NOT EXISTS "consumerDefensePhone" TEXT;
ALTER TABLE "companies"   ADD COLUMN IF NOT EXISTS "grossIncome" TEXT;
