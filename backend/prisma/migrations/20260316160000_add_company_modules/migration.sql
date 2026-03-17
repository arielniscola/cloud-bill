-- Add enabledModules to companies
-- "ALL" means full access; comma-separated module keys restrict access (ventas,catalogo,compras,finanzas)
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "enabledModules" TEXT NOT NULL DEFAULT 'ALL';
