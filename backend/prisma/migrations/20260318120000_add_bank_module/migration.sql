-- Bank accounts
CREATE TABLE bank_accounts (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          TEXT        NOT NULL,
  bank          TEXT        NOT NULL,
  "accountNumber" TEXT,
  currency      TEXT        NOT NULL DEFAULT 'ARS',
  balance       DECIMAL(12,2) NOT NULL DEFAULT 0,
  "companyId"   TEXT        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  "isActive"    BOOLEAN     NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Bank movements
CREATE TABLE bank_movements (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "bankAccountId" TEXT        NOT NULL REFERENCES bank_accounts(id),
  type            TEXT        NOT NULL,   -- CREDIT | DEBIT
  amount          DECIMAL(12,2) NOT NULL,
  description     TEXT        NOT NULL,
  date            TIMESTAMP   NOT NULL DEFAULT NOW(),
  "reciboId"      TEXT        UNIQUE REFERENCES recibos(id),
  "ordenPagoId"   TEXT        UNIQUE REFERENCES orden_pagos(id),
  "companyId"     TEXT        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  "createdAt"     TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMP   NOT NULL DEFAULT NOW()
);
