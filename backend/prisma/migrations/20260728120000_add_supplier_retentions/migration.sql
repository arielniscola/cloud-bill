-- Retenciones configurables por proveedor + retenciones practicadas en la Orden de Pago.
--
-- La retención se practica AL MOMENTO DEL PAGO (no en la factura): la deuda con
-- el proveedor se cancela por el bruto, pero el egreso de dinero es el neto.
-- `orden_pagos.retentionAmount` guarda la diferencia, que solo alimenta el
-- reporte de retenciones (no genera movimiento de cuenta corriente).

-- 1. Configuración por proveedor: qué se le retiene y sobre qué base.
CREATE TABLE "supplier_retentions" (
    "id"           TEXT NOT NULL,
    "supplierId"   TEXT NOT NULL,
    "companyId"    TEXT NOT NULL,
    "type"         TEXT NOT NULL DEFAULT 'IIBB',   -- IIBB | GANANCIAS | IVA | SUSS | OTHER
    "jurisdiction" TEXT,
    "base"         TEXT NOT NULL DEFAULT 'NETO',   -- NETO | IVA | BRUTO
    "percentage"   DECIMAL(6,3) NOT NULL DEFAULT 0,
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "notes"        TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_retentions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_retentions_supplierId_idx" ON "supplier_retentions"("supplierId");
CREATE INDEX "supplier_retentions_companyId_idx"  ON "supplier_retentions"("companyId");

ALTER TABLE "supplier_retentions"
    ADD CONSTRAINT "supplier_retentions_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Retenciones efectivamente practicadas en una Orden de Pago.
CREATE TABLE "orden_pago_retenciones" (
    "id"                  TEXT NOT NULL,
    "ordenPagoId"         TEXT NOT NULL,
    "supplierRetentionId" TEXT,                     -- config de origen (informativo; se conserva si se borra)
    "type"                TEXT NOT NULL DEFAULT 'IIBB',
    "jurisdiction"        TEXT,
    "base"                TEXT NOT NULL DEFAULT 'NETO',
    "baseAmount"          DECIMAL(14,2) NOT NULL DEFAULT 0,
    "percentage"          DECIMAL(6,3) NOT NULL DEFAULT 0,
    "amount"              DECIMAL(14,2) NOT NULL DEFAULT 0,
    "certificate"         TEXT,
    "notes"               TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orden_pago_retenciones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "orden_pago_retenciones_ordenPagoId_idx" ON "orden_pago_retenciones"("ordenPagoId");

ALTER TABLE "orden_pago_retenciones"
    ADD CONSTRAINT "orden_pago_retenciones_ordenPagoId_fkey"
    FOREIGN KEY ("ordenPagoId") REFERENCES "orden_pagos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orden_pago_retenciones"
    ADD CONSTRAINT "orden_pago_retenciones_supplierRetentionId_fkey"
    FOREIGN KEY ("supplierRetentionId") REFERENCES "supplier_retentions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Total retenido en la OP. `amount` sigue siendo el BRUTO imputado a las
--    facturas; el egreso real de caja/banco es `amount - retentionAmount`.
ALTER TABLE "orden_pagos" ADD COLUMN "retentionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
