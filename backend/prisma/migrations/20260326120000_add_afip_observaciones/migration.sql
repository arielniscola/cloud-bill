-- Add afipObservaciones field to invoices to persist ARCA observations/warnings
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "afipObservaciones" TEXT;
