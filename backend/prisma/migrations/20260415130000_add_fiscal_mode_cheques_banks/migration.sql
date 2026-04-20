-- Add fiscalMode to cheques
ALTER TABLE "cheques"
  ADD COLUMN IF NOT EXISTS "fiscalMode" TEXT NOT NULL DEFAULT 'FORMAL';

CREATE INDEX IF NOT EXISTS "idx_cheques_fiscalMode" ON "cheques"("fiscalMode");

-- Add fiscalMode to bank_movements
ALTER TABLE "bank_movements"
  ADD COLUMN IF NOT EXISTS "fiscalMode" TEXT NOT NULL DEFAULT 'FORMAL';

CREATE INDEX IF NOT EXISTS "idx_bank_movements_fiscalMode" ON "bank_movements"("fiscalMode");
