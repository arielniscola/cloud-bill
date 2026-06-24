-- Swap Categoría <-> Rubro (rename total).
-- La entidad jerárquica (parentId) pasa a llamarse Rubro (tabla "rubros");
-- la de descripción/variantes pasa a llamarse Categoría (tabla "categories").
-- Las tablas se renombran con sus columnas y FKs intactas (swap en 3 pasos).
-- Sin datos productivos → sin riesgo de pérdida.

-- ── Tablas ─────────────────────────────────────────────────────────────────────
ALTER TABLE "categories"    RENAME TO "__swap_cat_rub";
ALTER TABLE "rubros"        RENAME TO "categories";
ALTER TABLE "__swap_cat_rub" RENAME TO "rubros";

-- ── Columnas FK en products ────────────────────────────────────────────────────
-- (las FKs siguen apuntando a la tabla física correcta tras el swap de tablas)
ALTER TABLE "products" RENAME COLUMN "categoryId" TO "__swap_col";
ALTER TABLE "products" RENAME COLUMN "rubroId"    TO "categoryId";
ALTER TABLE "products" RENAME COLUMN "__swap_col" TO "rubroId";
