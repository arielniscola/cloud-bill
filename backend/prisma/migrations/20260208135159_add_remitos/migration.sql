-- CreateEnum
CREATE TYPE "RemitoStatus" AS ENUM ('PENDING', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockBehavior" AS ENUM ('DISCOUNT', 'RESERVE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'REMITO_OUT';
ALTER TYPE "StockMovementType" ADD VALUE 'RESERVATION';
ALTER TYPE "StockMovementType" ADD VALUE 'RESERVATION_RELEASE';

-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "reservedQuantity" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "remitos" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "RemitoStatus" NOT NULL DEFAULT 'PENDING',
    "stockBehavior" "StockBehavior" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remitos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remito_items" (
    "id" TEXT NOT NULL,
    "remitoId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "deliveredQuantity" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "remito_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "remitos_number_key" ON "remitos"("number");

-- AddForeignKey
ALTER TABLE "remitos" ADD CONSTRAINT "remitos_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remitos" ADD CONSTRAINT "remitos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remito_items" ADD CONSTRAINT "remito_items_remitoId_fkey" FOREIGN KEY ("remitoId") REFERENCES "remitos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remito_items" ADD CONSTRAINT "remito_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
