-- Make customerId nullable and add supplierId to internal_notes
ALTER TABLE "internal_notes" ALTER COLUMN "customerId" DROP NOT NULL;

ALTER TABLE "internal_notes"
  ADD COLUMN IF NOT EXISTS "supplierId" TEXT;

-- Exactly one of customerId / supplierId must be present
ALTER TABLE "internal_notes"
  ADD CONSTRAINT "internal_notes_entity_check"
  CHECK (
    ("customerId" IS NOT NULL AND "supplierId" IS NULL)
    OR
    ("customerId" IS NULL AND "supplierId" IS NOT NULL)
  );

-- FK to suppliers (if supplier is later deleted, note survives)
ALTER TABLE "internal_notes"
  ADD CONSTRAINT "internal_notes_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
  ON DELETE SET NULL;

-- Link supplier_account_movements back to internal notes (for reversal lookup)
ALTER TABLE "supplier_account_movements"
  ADD COLUMN IF NOT EXISTS "internalNoteId" TEXT UNIQUE;

ALTER TABLE "supplier_account_movements"
  ADD CONSTRAINT "supplier_account_movements_internalNoteId_fkey"
  FOREIGN KEY ("internalNoteId") REFERENCES "internal_notes"("id")
  ON DELETE SET NULL;
