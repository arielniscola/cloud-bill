-- Agrega la sucursal al catálogo de bancos (parametrización). Opcional.
ALTER TABLE "bancos" ADD COLUMN IF NOT EXISTS "sucursal" TEXT;
