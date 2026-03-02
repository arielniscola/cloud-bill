/*
  Warnings:

  - You are about to drop the column `paymentMethod` on the `account_movements` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "account_movements" DROP COLUMN "paymentMethod",
ADD COLUMN     "cashRegisterId" TEXT;

-- DropEnum
DROP TYPE "PaymentMethod";

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
