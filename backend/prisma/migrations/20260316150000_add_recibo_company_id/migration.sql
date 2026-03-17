-- Add companyId to recibos (was omitted from add_multi_company migration)
ALTER TABLE "recibos" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

CREATE INDEX IF NOT EXISTS "recibos_companyId_idx" ON "recibos"("companyId");
