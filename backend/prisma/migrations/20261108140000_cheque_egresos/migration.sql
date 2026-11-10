-- Egreso de cheques en cartera (cambio por efectivo, entrega a terceros,
-- devolución, extravío…). Motivos parametrizables por empresa y registro de
-- quién y cuándo lo egresó. El cheque (manual o de cobranza) pasa a EGRESADO.

CREATE TABLE IF NOT EXISTS "cheque_egreso_reasons" (
  "id"        TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "cheque_egreso_reasons_company_name_key"
  ON "cheque_egreso_reasons" ("companyId", lower("name"));

CREATE TABLE IF NOT EXISTS "cheque_egresos" (
  "id"           TEXT PRIMARY KEY,
  "companyId"    TEXT NOT NULL,
  -- Origen del cheque: CHEQUE (cargado en Cheques) o RECIBO (cobranza con cheque)
  "source"       TEXT NOT NULL,
  "chequeId"     TEXT REFERENCES "cheques"("id"),
  "reciboId"     TEXT REFERENCES "recibos"("id"),
  -- Copia de los datos del cheque al momento del egreso
  "checkNumber"  TEXT,
  "bank"         TEXT,
  "amount"       DECIMAL(12,2) NOT NULL,
  "currency"     TEXT NOT NULL DEFAULT 'ARS',
  "dueDate"      TIMESTAMP(3),
  "holder"       TEXT,
  "reasonId"     TEXT REFERENCES "cheque_egreso_reasons"("id"),
  "reasonName"   TEXT NOT NULL,
  "notes"        TEXT,
  "date"         DATE NOT NULL,
  "userId"       TEXT NOT NULL,
  "fiscalMode"   TEXT NOT NULL DEFAULT 'FORMAL',
  "status"       TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | CANCELLED
  "cancelledAt"     TIMESTAMP(3),
  "cancelledById"   TEXT,
  "cancelReason"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_cheque_egresos_company_date" ON "cheque_egresos" ("companyId", "date" DESC);
CREATE INDEX IF NOT EXISTS "idx_cheque_egresos_cheque" ON "cheque_egresos" ("chequeId");
CREATE INDEX IF NOT EXISTS "idx_cheque_egresos_recibo" ON "cheque_egresos" ("reciboId");
