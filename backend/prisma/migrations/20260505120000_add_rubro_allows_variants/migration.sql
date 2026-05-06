-- Rubros que admiten variantes (talles, colores, etc.)
-- Útil para gating de la UI de variantes — solo se muestra en productos cuyo rubro tiene este flag activo.
ALTER TABLE "rubros"
  ADD COLUMN IF NOT EXISTS "allowsVariants" BOOLEAN NOT NULL DEFAULT false;
