-- Create companies table
CREATE TABLE "companies" (
  "id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  "name" TEXT NOT NULL DEFAULT 'Empresa Principal',
  "cuit" TEXT,
  "address" TEXT,
  "city" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "taxCondition" TEXT NOT NULL DEFAULT 'RESPONSABLE_INSCRIPTO',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "logoUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- Seed default company (will be updated from afip_config if data exists)
INSERT INTO "companies" ("id", "name", "cuit")
SELECT '00000000-0000-0000-0000-000000000001', COALESCE(MAX("businessName"), 'Empresa Principal'), MAX("cuit")
FROM "afip_config"
ON CONFLICT DO NOTHING;

-- Fallback if no afip_config
INSERT INTO "companies" ("id", "name")
VALUES ('00000000-0000-0000-0000-000000000001', 'Empresa Principal')
ON CONFLICT DO NOTHING;

-- Add companyId to users (nullable — null = super-admin)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
UPDATE "users" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;

-- Add companyId to transactional/catalog tables
ALTER TABLE "invoices"      ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "budgets"       ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "customers"     ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "suppliers"     ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "products"      ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "warehouses"    ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "purchases"     ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "remitos"       ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "orden_pedidos" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "orden_compras" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "invoices_companyId_idx"      ON "invoices"("companyId");
CREATE INDEX IF NOT EXISTS "budgets_companyId_idx"       ON "budgets"("companyId");
CREATE INDEX IF NOT EXISTS "customers_companyId_idx"     ON "customers"("companyId");
CREATE INDEX IF NOT EXISTS "suppliers_companyId_idx"     ON "suppliers"("companyId");
CREATE INDEX IF NOT EXISTS "products_companyId_idx"      ON "products"("companyId");
CREATE INDEX IF NOT EXISTS "warehouses_companyId_idx"    ON "warehouses"("companyId");
CREATE INDEX IF NOT EXISTS "purchases_companyId_idx"     ON "purchases"("companyId");
CREATE INDEX IF NOT EXISTS "remitos_companyId_idx"       ON "remitos"("companyId");
CREATE INDEX IF NOT EXISTS "orden_pedidos_companyId_idx" ON "orden_pedidos"("companyId");
CREATE INDEX IF NOT EXISTS "orden_compras_companyId_idx" ON "orden_compras"("companyId");
CREATE INDEX IF NOT EXISTS "cash_registers_companyId_idx" ON "cash_registers"("companyId");
