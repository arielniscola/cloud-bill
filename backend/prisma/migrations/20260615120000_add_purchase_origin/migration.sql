-- Add originPurchaseId to purchases for NC/ND linking to the source purchase
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "originPurchaseId" TEXT;

ALTER TABLE "purchases" DROP CONSTRAINT IF EXISTS "purchases_originPurchaseId_fkey";
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_originPurchaseId_fkey"
  FOREIGN KEY ("originPurchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
