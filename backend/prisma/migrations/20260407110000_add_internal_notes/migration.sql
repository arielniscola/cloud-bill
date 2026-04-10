-- CreateTable internal_notes
CREATE TABLE "internal_notes" (
  "id"          TEXT NOT NULL,
  "number"      TEXT NOT NULL,
  "type"        TEXT NOT NULL,                         -- DEBIT | CREDIT
  "customerId"  TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "currency"    TEXT NOT NULL DEFAULT 'ARS',
  "amount"      DECIMAL(12,2) NOT NULL,
  "reason"      TEXT NOT NULL,
  "notes"       TEXT,
  "status"      TEXT NOT NULL DEFAULT 'ACTIVE',        -- ACTIVE | CANCELLED
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "internal_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "internal_notes_number_key" ON "internal_notes"("number");

-- FK internalNoteId in account_movements
ALTER TABLE "account_movements"
  ADD COLUMN IF NOT EXISTS "internalNoteId" TEXT UNIQUE;

ALTER TABLE "account_movements"
  ADD CONSTRAINT "account_movements_internalNoteId_fkey"
  FOREIGN KEY ("internalNoteId") REFERENCES "internal_notes"("id")
  ON DELETE SET NULL;
