-- CreateTable cards
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CREDIT',
    "bank" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable card_surcharges
CREATE TABLE "card_surcharges" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "surchargePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "card_surcharges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex unique surcharge per card+installments
CREATE UNIQUE INDEX "card_surcharges_cardId_installments_key" ON "card_surcharges"("cardId", "installments");

-- AddForeignKey
ALTER TABLE "card_surcharges" ADD CONSTRAINT "card_surcharges_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable recibos: add card fields
ALTER TABLE "recibos"
    ADD COLUMN "cardId" TEXT,
    ADD COLUMN "surchargePercent" DECIMAL(5,2),
    ADD COLUMN "surchargeAmount" DECIMAL(12,2);

-- AddForeignKey recibos -> cards
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
