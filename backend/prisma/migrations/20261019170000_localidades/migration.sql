-- Catálogo de localidades (parametrización). Alimenta el desplegable de
-- localidad de clientes y proveedores. Igual que provincias y bancos, los
-- campos siguen guardando el NOMBRE (`customers.city`, `suppliers.city`).
-- Sin seed: el catálogo se arma a mano o importando las localidades que ya
-- están cargadas en clientes/proveedores (POST /api/localidades/import).
CREATE TABLE IF NOT EXISTS "localidades" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "provinciaId" TEXT,
  "postalCode"  TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "companyId"   TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "localidades_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "localidades_provinciaId_fkey" FOREIGN KEY ("provinciaId") REFERENCES "provincias"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- La misma localidad no se repite dentro de una provincia ("San Martín" existe en varias).
CREATE UNIQUE INDEX IF NOT EXISTS "localidades_company_prov_name_key"
  ON "localidades" ("companyId", COALESCE("provinciaId", ''), LOWER("name"));
