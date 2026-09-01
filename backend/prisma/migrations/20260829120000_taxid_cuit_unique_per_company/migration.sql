-- CUIT único POR EMPRESA, no global.
--
-- Antes, `customers.taxId` y `suppliers.cuit` eran únicos en toda la base: dos
-- empresas del sistema no podían tener el mismo cliente ni el mismo proveedor,
-- y el error de duplicado delataba que el CUIT existía en otra cuenta.
-- Mismo criterio que ya se aplicó al SKU de productos.

DROP INDEX IF EXISTS "customers_taxId_key";
DROP INDEX IF EXISTS "suppliers_cuit_key";

-- NULL no participa de la unicidad en Postgres: los clientes/proveedores sin
-- CUIT (consumidor final) siguen pudiendo cargarse sin límite.
CREATE UNIQUE INDEX "customers_company_taxid_key" ON "customers" ("companyId", "taxId");
CREATE UNIQUE INDEX "suppliers_company_cuit_key" ON "suppliers" ("companyId", "cuit");
