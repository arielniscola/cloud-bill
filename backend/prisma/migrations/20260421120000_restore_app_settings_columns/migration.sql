-- Restore columns on app_settings that were accidentally dropped by 20260407002131_add_cards

ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "printFormat"     TEXT    NOT NULL DEFAULT 'A4',
  ADD COLUMN IF NOT EXISTS "smtpHost"        TEXT,
  ADD COLUMN IF NOT EXISTS "smtpPort"        INTEGER NOT NULL DEFAULT 587,
  ADD COLUMN IF NOT EXISTS "smtpUser"        TEXT,
  ADD COLUMN IF NOT EXISTS "smtpPass"        TEXT,
  ADD COLUMN IF NOT EXISTS "smtpFrom"        TEXT,
  ADD COLUMN IF NOT EXISTS "smtpSecure"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "mpAccessToken"   TEXT,
  ADD COLUMN IF NOT EXISTS "mpPublicKey"     TEXT,
  ADD COLUMN IF NOT EXISTS "mpWebhookSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "mpMode"          TEXT    NOT NULL DEFAULT 'test';
