-- Chequeras (talonarios de cheques propios) — dentro de Banco de Cheques.
-- Una chequera pertenece a un banco + número de cuenta y maneja un rango de
-- números de cheque; al emitir un EGRESO se toma el próximo número y se incrementa.
CREATE TABLE IF NOT EXISTS "chequeras" (
  "id"            TEXT NOT NULL,
  "name"          TEXT,                               -- alias/descripción (opcional)
  "bank"          TEXT NOT NULL,                      -- banco (del catálogo o libre)
  "accountNumber" TEXT NOT NULL,                      -- número de cuenta
  "numberFrom"    INTEGER,                            -- primer N° de cheque del talonario
  "numberTo"      INTEGER,                            -- último N° de cheque del talonario
  "nextNumber"    INTEGER,                            -- próximo N° a emitir
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "companyId"     TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chequeras_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "chequeras_companyId_idx" ON "chequeras" ("companyId");

-- Vínculo del cheque emitido con la chequera de la que sale.
ALTER TABLE "cheques" ADD COLUMN IF NOT EXISTS "chequeraId" TEXT;
