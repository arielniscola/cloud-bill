-- Formas de pago de una Orden de Pago: una OP puede pagarse con varias
-- (efectivo de una caja, transferencia, tarjeta… y cheques). Cada línea es lo
-- que efectivamente sale por ese medio; la suma de las líneas es el NETO de la
-- OP (amount - retentionAmount). Los cheques siguen en "cheques" (ordenPagoId);
-- su total queda además como una línea CHECK para tener el desglose completo.
CREATE TABLE IF NOT EXISTS "orden_pago_payments" (
  "id"             TEXT PRIMARY KEY,
  "ordenPagoId"    TEXT NOT NULL REFERENCES "orden_pagos"("id") ON DELETE CASCADE,
  "method"         TEXT NOT NULL,            -- CASH | BANK_TRANSFER | CHECK | CARD | MERCADO_PAGO | COMPENSACION
  "amount"         DECIMAL(12, 2) NOT NULL,
  "cashRegisterId" TEXT REFERENCES "cash_registers"("id") ON DELETE SET NULL,
  "bank"           TEXT,
  "reference"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_op_payments_op"   ON "orden_pago_payments" ("ordenPagoId");
CREATE INDEX IF NOT EXISTS "idx_op_payments_cash" ON "orden_pago_payments" ("cashRegisterId") WHERE "cashRegisterId" IS NOT NULL;

-- Backfill: cada OP existente queda con una sola línea (su método, por el neto).
INSERT INTO "orden_pago_payments" ("id", "ordenPagoId", "method", "amount", "cashRegisterId", "bank", "reference", "createdAt")
SELECT gen_random_uuid()::text, op.id, op."paymentMethod", op.amount - op."retentionAmount",
       CASE WHEN op."paymentMethod" = 'CASH' THEN op."cashRegisterId" END, op.bank, op.reference, op."createdAt"
FROM "orden_pagos" op
WHERE NOT EXISTS (SELECT 1 FROM "orden_pago_payments" p WHERE p."ordenPagoId" = op.id);
