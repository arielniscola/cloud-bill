-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK', 'MERCADO_PAGO');

-- AlterTable
ALTER TABLE "account_movements" ADD COLUMN     "paymentMethod" "PaymentMethod";
