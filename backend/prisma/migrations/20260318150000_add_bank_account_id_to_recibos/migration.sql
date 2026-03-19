-- Add bankAccountId to recibos for BANK_TRANSFER payments
ALTER TABLE "recibos" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL;
