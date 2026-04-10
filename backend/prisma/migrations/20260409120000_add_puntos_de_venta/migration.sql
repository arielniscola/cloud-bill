-- Puntos de Venta registrados ante AFIP
CREATE TABLE "puntos_de_venta" (
  "id"        TEXT NOT NULL,
  "number"    INTEGER NOT NULL,           -- número AFIP: 1-9999
  "name"      TEXT NOT NULL,             -- nombre descriptivo (ej: "Caja 1", "Sucursal Norte")
  "companyId" TEXT NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "puntos_de_venta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pdv_number_company_key" ON "puntos_de_venta"("number", "companyId");
CREATE INDEX "pdv_company_idx" ON "puntos_de_venta"("companyId");

-- Contadores atómicos por PdV + tipo de comprobante
-- Clave: (pdvId, invoiceType) ej: ('uuid', 'FACTURA_A')
CREATE TABLE "pdv_counters" (
  "id"             TEXT NOT NULL,
  "pdvId"          TEXT NOT NULL,
  "invoiceType"    TEXT NOT NULL,    -- FACTURA_A | FACTURA_B | FACTURA_C | NOTA_CREDITO_A | ...
  "lastNumber"     INTEGER NOT NULL DEFAULT 0,
  "syncedFromAfip" BOOLEAN NOT NULL DEFAULT false,  -- true = ya se sincronizó con AFIP
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pdv_counters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pdv_counters_pdv_fkey" FOREIGN KEY ("pdvId") REFERENCES "puntos_de_venta"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "pdv_counters_pdv_type_key" ON "pdv_counters"("pdvId", "invoiceType");

-- Asignar PdV a usuarios (cada usuario = terminal)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pdvId" TEXT REFERENCES "puntos_de_venta"("id") ON DELETE SET NULL;
