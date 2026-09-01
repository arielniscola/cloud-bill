-- ============================================================================
-- number pasa de UNIQUE global a UNIQUE por empresa
--
-- Con la numeración global, la empresa B no podía emitir FA-2026-00000001 si la
-- empresa A ya la tenía: el unique global filtraba entre inquilinos. Ahora que
-- cada empresa lleva su propia secuencia (ver 20260827130000), el número sólo
-- tiene que ser único DENTRO de la empresa.
--
-- El unique compuesto es más débil que el global, así que ningún dato existente
-- puede violarlo: la migración no puede fallar por duplicados.
-- ============================================================================

-- invoices
DROP INDEX IF EXISTS "invoices_number_key";
CREATE UNIQUE INDEX "invoices_companyId_number_key" ON "invoices" ("companyId", "number");

-- remitos
DROP INDEX IF EXISTS "remitos_number_key";
CREATE UNIQUE INDEX "remitos_companyId_number_key" ON "remitos" ("companyId", "number");

-- budgets
DROP INDEX IF EXISTS "budgets_number_key";
CREATE UNIQUE INDEX "budgets_companyId_number_key" ON "budgets" ("companyId", "number");

-- recibos
DROP INDEX IF EXISTS "recibos_number_key";
CREATE UNIQUE INDEX "recibos_companyId_number_key" ON "recibos" ("companyId", "number");

-- orden_pedidos
DROP INDEX IF EXISTS "orden_pedidos_number_key";
CREATE UNIQUE INDEX "orden_pedidos_companyId_number_key" ON "orden_pedidos" ("companyId", "number");

-- orden_compras (módulo desactivado, pero la tabla y los datos se conservan)
ALTER TABLE "orden_compras" DROP CONSTRAINT IF EXISTS "orden_compras_number_key";
DROP INDEX IF EXISTS "orden_compras_number_key";
CREATE UNIQUE INDEX "orden_compras_companyId_number_key" ON "orden_compras" ("companyId", "number");

-- orden_pagos
ALTER TABLE "orden_pagos" DROP CONSTRAINT IF EXISTS "orden_pagos_number_key";
DROP INDEX IF EXISTS "orden_pagos_number_key";
CREATE UNIQUE INDEX "orden_pagos_companyId_number_key" ON "orden_pagos" ("companyId", "number");

-- cheques
DROP INDEX IF EXISTS "cheques_number_key";
CREATE UNIQUE INDEX "cheques_companyId_number_key" ON "cheques" ("companyId", "number");

-- internal_notes
DROP INDEX IF EXISTS "internal_notes_number_key";
CREATE UNIQUE INDEX "internal_notes_companyId_number_key" ON "internal_notes" ("companyId", "number");

-- purchase_remitos: no tenía unique de ningún tipo. Se lo damos ahora, que es
-- justamente la red que convierte una colisión de numeración en un error
-- inmediato en vez de dos remitos con el mismo número.
CREATE UNIQUE INDEX "purchase_remitos_companyId_number_key" ON "purchase_remitos" ("companyId", "number");
