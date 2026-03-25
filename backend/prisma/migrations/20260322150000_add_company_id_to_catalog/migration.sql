-- Add companyId to categories
ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- Add companyId to brands
ALTER TABLE "brands"
  ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- Add companyId to afip_config
ALTER TABLE "afip_config"
  ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- Rename app_settings 'default' row to use the default company id
UPDATE "app_settings" SET "id" = '00000000-0000-0000-0000-000000000001' WHERE id = 'default';

-- Indexes
CREATE INDEX IF NOT EXISTS "categories_companyId_idx" ON "categories"("companyId");
CREATE INDEX IF NOT EXISTS "brands_companyId_idx" ON "brands"("companyId");
CREATE INDEX IF NOT EXISTS "afip_config_companyId_idx" ON "afip_config"("companyId");
