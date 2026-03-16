-- Add checkStatus to recibos (only relevant for CHECK payment method)
ALTER TABLE "recibos" ADD COLUMN "checkStatus" TEXT DEFAULT NULL;

-- Set existing CHECK recibos to PENDING
UPDATE "recibos" SET "checkStatus" = 'PENDING' WHERE "paymentMethod" = 'CHECK' AND "status" = 'EMITTED';
