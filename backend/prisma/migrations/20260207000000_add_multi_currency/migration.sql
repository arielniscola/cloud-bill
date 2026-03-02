-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('ARS', 'USD');

-- DropIndex
DROP INDEX "current_accounts_customerId_key";

-- AlterTable
ALTER TABLE "current_accounts" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'ARS';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'ARS',
ADD COLUMN     "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "current_accounts_customerId_currency_key" ON "current_accounts"("customerId", "currency");
