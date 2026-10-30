-- Motivos de retiros / ingresos de caja (Combustible, Viáticos, Sueldos…),
-- configurables por empresa. Son una clasificación ADEMÁS del concepto: el
-- concepto (RETIRO, GASTO, DEPOSITO_BANCARIO…) sigue decidiendo si se mueve
-- el banco. `type`: OUT (egresos), IN (ingresos) o BOTH.
CREATE TABLE IF NOT EXISTS "cash_movement_reasons" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "type"      TEXT NOT NULL DEFAULT 'OUT',
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_movement_reasons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cash_movement_reasons_company_name_key"
  ON "cash_movement_reasons" ("companyId", lower("name"));

-- En el movimiento va el id y una copia del nombre: renombrar o desactivar un
-- motivo no cambia los comprobantes ya emitidos.
ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "reasonId" TEXT;
ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "reasonName" TEXT;
DO $$ BEGIN
  ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_reasonId_fkey"
    FOREIGN KEY ("reasonId") REFERENCES "cash_movement_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_cash_movements_reason" ON "cash_movements" ("reasonId");
