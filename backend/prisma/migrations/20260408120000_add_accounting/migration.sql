-- CreateTable: accounts (plan de cuentas)
CREATE TABLE "accounts" (
  "id"           TEXT NOT NULL,
  "code"         TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "type"         TEXT NOT NULL,          -- ASSET | LIABILITY | EQUITY | INCOME | EXPENSE
  "parentCode"   TEXT,
  "level"        INTEGER NOT NULL DEFAULT 1,
  "isAuxiliary"  BOOLEAN NOT NULL DEFAULT false,  -- true = leaf node that accepts journal lines
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "companyId"    TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounts_code_companyId_key" ON "accounts"("code", "companyId");
CREATE INDEX "accounts_companyId_idx" ON "accounts"("companyId");

-- CreateTable: journal_entries (asientos contables)
CREATE TABLE "journal_entries" (
  "id"              TEXT NOT NULL,
  "number"          TEXT NOT NULL,        -- ASI-YYYY-XXXXXX
  "date"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "description"     TEXT NOT NULL,
  "referenceType"   TEXT,                 -- INVOICE | PAYMENT | PURCHASE | MANUAL
  "referenceId"     TEXT,
  "companyId"       TEXT NOT NULL,
  "userId"          TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "journal_entries_number_companyId_key" ON "journal_entries"("number", "companyId");
CREATE INDEX "journal_entries_companyId_idx" ON "journal_entries"("companyId");
CREATE INDEX "journal_entries_referenceId_idx" ON "journal_entries"("referenceId");

-- CreateTable: journal_entry_lines (líneas de asiento — partida doble)
CREATE TABLE "journal_entry_lines" (
  "id"               TEXT NOT NULL,
  "journalEntryId"   TEXT NOT NULL,
  "accountCode"      TEXT NOT NULL,
  "accountId"        TEXT NOT NULL,
  "description"      TEXT,
  "debit"            DECIMAL(15,2) NOT NULL DEFAULT 0,
  "credit"           DECIMAL(15,2) NOT NULL DEFAULT 0,
  CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "journal_entry_lines_journalEntryId_fkey"
    FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE,
  CONSTRAINT "journal_entry_lines_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT
);

CREATE INDEX "journal_entry_lines_journalEntryId_idx" ON "journal_entry_lines"("journalEntryId");
