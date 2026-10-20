-- Catálogo de provincias (parametrización). Alimenta los desplegables donde la
-- provincia se escribía a mano (cliente, jurisdicción de percepciones IIBB).
-- Los campos siguen guardando el NOMBRE (string), igual que el catálogo de bancos.
-- Las 24 jurisdicciones se cargan solas la primera vez que la empresa lista el catálogo.
CREATE TABLE IF NOT EXISTS "provincias" (
  "id"               TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "afipCode"         INTEGER,                         -- código de provincia de ARCA (padrón: idProvincia)
  "jurisdictionCode" TEXT,                            -- código de jurisdicción Convenio Multilateral (901…924)
  "isActive"         BOOLEAN NOT NULL DEFAULT true,
  "companyId"        TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provincias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "provincias_company_name_key" ON "provincias" ("companyId", LOWER("name"));
