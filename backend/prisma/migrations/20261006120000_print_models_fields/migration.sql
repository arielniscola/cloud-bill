-- Datos que piden los modelos de comprobantes impresos (factura, NN, remito,
-- recibo y orden de pago) y que el sistema no guardaba.

-- Código correlativo visible de cliente y proveedor, único por empresa.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "code" INTEGER;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "grossIncome" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "code" INTEGER;

-- Backfill por orden de alta dentro de cada empresa.
UPDATE "customers" c SET "code" = n.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", id) AS rn
  FROM "customers"
) n
WHERE c.id = n.id AND c."code" IS NULL;

UPDATE "suppliers" s SET "code" = n.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", id) AS rn
  FROM "suppliers"
) n
WHERE s.id = n.id AND s."code" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "customers_company_code_key" ON "customers" ("companyId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_company_code_key" ON "suppliers" ("companyId", "code");

-- Las altas siguientes toman el código de document_sequences (year = 0: la
-- secuencia no se reinicia por año). Se siembra con el máximo ya asignado.
INSERT INTO "document_sequences" ("id", "companyId", "docType", "year", "nextNumber", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "companyId", 'CUSTOMER_CODE', 0, MAX("code") + 1, NOW(), NOW()
FROM "customers" GROUP BY "companyId"
ON CONFLICT ("companyId", "docType", "year") DO UPDATE
  SET "nextNumber" = GREATEST("document_sequences"."nextNumber", EXCLUDED."nextNumber");

INSERT INTO "document_sequences" ("id", "companyId", "docType", "year", "nextNumber", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "companyId", 'SUPPLIER_CODE', 0, MAX("code") + 1, NOW(), NOW()
FROM "suppliers" GROUP BY "companyId"
ON CONFLICT ("companyId", "docType", "year") DO UPDATE
  SET "nextNumber" = GREATEST("document_sequences"."nextNumber", EXCLUDED."nextNumber");

-- Transporte (texto libre) en factura y remito.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "transport" TEXT;
ALTER TABLE "remitos"  ADD COLUMN IF NOT EXISTS "transport" TEXT;

-- Datos de impresión por empresa.
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "printWebsite"       TEXT;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "printEstablishment" TEXT;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "remitoCai"          TEXT;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "remitoCaiExpiry"    TEXT; -- 'YYYY-MM-DD'
