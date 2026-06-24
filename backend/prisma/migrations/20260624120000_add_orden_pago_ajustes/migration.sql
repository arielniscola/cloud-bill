-- Ajustes al pago a proveedores (descuentos obtenidos, intereses, etc.).
-- Cada ajuste referencia una cuenta del plan contable y suma o resta al total.
CREATE TABLE IF NOT EXISTS "orden_pago_ajustes" (
  "id"          TEXT NOT NULL,
  "ordenPagoId" TEXT NOT NULL,
  "accountId"   TEXT,
  "accountCode" TEXT,
  "description" TEXT NOT NULL,
  "type"        TEXT NOT NULL DEFAULT 'RESTA',          -- SUMA | RESTA
  "amount"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "orden_pago_ajustes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "orden_pago_ajustes_ordenPagoId_fkey"
    FOREIGN KEY ("ordenPagoId") REFERENCES "orden_pagos"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "orden_pago_ajustes_ordenPagoId_idx" ON "orden_pago_ajustes" ("ordenPagoId");
