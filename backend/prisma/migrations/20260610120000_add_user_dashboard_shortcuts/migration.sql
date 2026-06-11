-- Accesos rápidos del dashboard configurables por usuario.
-- Guarda un array JSON de ids de accesos en el orden elegido (NULL = usar el default).
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "dashboardShortcuts" TEXT;
