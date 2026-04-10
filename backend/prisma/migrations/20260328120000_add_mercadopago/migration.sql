-- MercadoPago: credentials in app_settings
ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "mpAccessToken"   TEXT,
  ADD COLUMN IF NOT EXISTS "mpPublicKey"     TEXT,
  ADD COLUMN IF NOT EXISTS "mpWebhookSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "mpMode"          TEXT NOT NULL DEFAULT 'test';

-- MercadoPago: link payment ID back to recibo
ALTER TABLE "recibos"
  ADD COLUMN IF NOT EXISTS "mpPaymentId"    TEXT,
  ADD COLUMN IF NOT EXISTS "mpPreferenceId" TEXT;

-- Track pending MP preferences (before payment is confirmed)
CREATE TABLE IF NOT EXISTS "mp_preferences" (
  "id"                TEXT        NOT NULL PRIMARY KEY,
  "preferenceId"      TEXT        NOT NULL UNIQUE,
  "externalReference" TEXT        NOT NULL,
  "type"              TEXT        NOT NULL DEFAULT 'INVOICE',
  "amount"            DECIMAL(12,2) NOT NULL,
  "customerId"        TEXT        NOT NULL,
  "userId"            TEXT        NOT NULL,
  "cashRegisterId"    TEXT,
  "notes"             TEXT,
  "status"            TEXT        NOT NULL DEFAULT 'PENDING',
  "companyId"         TEXT        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
