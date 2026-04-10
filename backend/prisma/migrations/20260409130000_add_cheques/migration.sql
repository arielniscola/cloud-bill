-- CreateTable: cheques (manual check entries)
CREATE TABLE "cheques" (
  "id"             TEXT NOT NULL,
  "number"         TEXT NOT NULL,
  "type"           TEXT NOT NULL,            -- INGRESO | EGRESO
  "checkNumber"    TEXT,                     -- N° del cheque físico
  "bank"           TEXT,                     -- Banco emisor
  "amount"         DECIMAL(12,2) NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'ARS',
  "exchangeRate"   DECIMAL(12,4) NOT NULL DEFAULT 1,
  "dueDate"        TIMESTAMP(3),             -- Fecha de vencimiento
  "issuer"         TEXT,                     -- Librador (para INGRESO)
  "beneficiary"    TEXT,                     -- Beneficiario (para EGRESO)
  "status"         TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | DEPOSITED | CLEARED | BOUNCED | RETURNED
  "notes"          TEXT,
  "customerId"     TEXT,
  "supplierId"     TEXT,
  "bankAccountId"  TEXT,
  "cashRegisterId" TEXT,
  "userId"         TEXT NOT NULL,
  "companyId"      TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cheques_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cheques_number_key" ON "cheques"("number");
