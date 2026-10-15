-- Copias del remito A4: TWO_PER_PAGE (original + duplicado en la misma hoja),
-- ONE_PER_PAGE (una hoja por copia) o SINGLE (una sola copia).
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "remitoCopies" TEXT NOT NULL DEFAULT 'TWO_PER_PAGE';
