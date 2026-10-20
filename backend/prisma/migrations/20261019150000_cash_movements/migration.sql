-- Movimientos manuales de caja: retiros, depósitos al banco, gastos menores,
-- aportes, fondo de cambio y extracciones del banco. Hasta ahora la caja solo
-- veía cobros y órdenes de pago; la plata que se sacaba o ponía a mano no
-- entraba ni en el listado ni en el cierre.
-- DEPOSITO_BANCARIO / EXTRACCION_BANCARIA llevan `bankAccountId` y mueven
-- también la cuenta bancaria (CREDIT / DEBIT). Anular revierte el banco.
CREATE TABLE IF NOT EXISTS "cash_movements" (
  "id"             TEXT NOT NULL,
  "companyId"      TEXT NOT NULL,
  "cashRegisterId" TEXT NOT NULL,
  "number"         TEXT NOT NULL,
  "type"           TEXT NOT NULL,                     -- IN | OUT
  "concept"        TEXT NOT NULL,                     -- RETIRO | DEPOSITO_BANCARIO | GASTO | APORTE | FONDO_CAMBIO | EXTRACCION_BANCARIA | OTRO
  "amount"         DECIMAL(12,2) NOT NULL,
  "personName"     TEXT,                              -- quién retira / entrega la plata (va en la firma del comprobante)
  "notes"          TEXT,
  "bankAccountId"  TEXT,
  "status"         TEXT NOT NULL DEFAULT 'ACTIVE',    -- ACTIVE | CANCELLED
  "cancelledAt"    TIMESTAMP(3),
  "userId"         TEXT,
  "fiscalMode"     TEXT NOT NULL DEFAULT 'FORMAL',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_movements_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cash_movements_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cash_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "cash_movements_companyId_number_key" ON "cash_movements" ("companyId", "number");
CREATE INDEX IF NOT EXISTS "idx_cash_movements_register_created" ON "cash_movements" ("cashRegisterId", "createdAt" DESC);
