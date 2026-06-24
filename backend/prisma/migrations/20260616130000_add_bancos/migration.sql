-- Catálogo maestro de bancos (parametrización). Fuente de los desplegables donde
-- hoy el banco se escribe a mano (cheques, órdenes de pago, cuentas bancarias,
-- recibos, tarjetas). No reemplaza esos campos de texto: los alimenta.
CREATE TABLE IF NOT EXISTS "bancos" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "code"      TEXT,                                  -- código de entidad (opcional, p.ej. BCRA)
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bancos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bancos_companyId_idx" ON "bancos" ("companyId");
