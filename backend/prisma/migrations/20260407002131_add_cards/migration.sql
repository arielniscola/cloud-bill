/*
  Warnings:

  - You are about to drop the column `mpAccessToken` on the `app_settings` table. All the data in the column will be lost.
  - You are about to drop the column `mpMode` on the `app_settings` table. All the data in the column will be lost.
  - You are about to drop the column `mpPublicKey` on the `app_settings` table. All the data in the column will be lost.
  - You are about to drop the column `mpWebhookSecret` on the `app_settings` table. All the data in the column will be lost.
  - You are about to drop the column `printFormat` on the `app_settings` table. All the data in the column will be lost.
  - You are about to drop the column `smtpFrom` on the `app_settings` table. All the data in the column will be lost.
  - You are about to drop the column `smtpHost` on the `app_settings` table. All the data in the column will be lost.
  - You are about to drop the column `smtpPass` on the `app_settings` table. All the data in the column will be lost.
  - You are about to drop the column `smtpPort` on the `app_settings` table. All the data in the column will be lost.
  - You are about to drop the column `smtpSecure` on the `app_settings` table. All the data in the column will be lost.
  - You are about to drop the column `smtpUser` on the `app_settings` table. All the data in the column will be lost.
  - You are about to drop the column `stalePriceWarnDays1` on the `app_settings` table. All the data in the column will be lost.
  - You are about to drop the column `stalePriceWarnDays2` on the `app_settings` table. All the data in the column will be lost.
  - The `currency` column on the `orden_compras` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `purchaseInvoiceId` on the `orden_pago_items` table. All the data in the column will be lost.
  - You are about to drop the column `warehouseId` on the `orden_pedidos` table. All the data in the column will be lost.
  - You are about to drop the column `bankAccountId` on the `recibos` table. All the data in the column will be lost.
  - You are about to drop the column `mpPaymentId` on the `recibos` table. All the data in the column will be lost.
  - You are about to drop the column `mpPreferenceId` on the `recibos` table. All the data in the column will be lost.
  - You are about to drop the `invoice_afip_errors` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `mp_preferences` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "bank_movements" DROP CONSTRAINT "bank_movements_bankAccountId_fkey";

-- DropForeignKey
ALTER TABLE "bank_movements" DROP CONSTRAINT "bank_movements_ordenPagoId_fkey";

-- DropForeignKey
ALTER TABLE "bank_movements" DROP CONSTRAINT "bank_movements_reciboId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_afip_errors" DROP CONSTRAINT "invoice_afip_errors_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_ordenPedidoId_fkey";

-- DropForeignKey
ALTER TABLE "orden_compra_items" DROP CONSTRAINT "orden_compra_items_ordenCompraId_fkey";

-- DropForeignKey
ALTER TABLE "orden_compra_items" DROP CONSTRAINT "orden_compra_items_productId_fkey";

-- DropForeignKey
ALTER TABLE "orden_compras" DROP CONSTRAINT "orden_compras_purchaseId_fkey";

-- DropForeignKey
ALTER TABLE "orden_compras" DROP CONSTRAINT "orden_compras_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "orden_compras" DROP CONSTRAINT "orden_compras_userId_fkey";

-- DropForeignKey
ALTER TABLE "orden_compras" DROP CONSTRAINT "orden_compras_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "orden_pago_items" DROP CONSTRAINT "orden_pago_items_ordenPagoId_fkey";

-- DropForeignKey
ALTER TABLE "orden_pago_items" DROP CONSTRAINT "orden_pago_items_purchaseId_fkey";

-- DropForeignKey
ALTER TABLE "orden_pago_items" DROP CONSTRAINT "orden_pago_items_purchaseInvoiceId_fkey";

-- DropForeignKey
ALTER TABLE "orden_pagos" DROP CONSTRAINT "orden_pagos_cashRegisterId_fkey";

-- DropForeignKey
ALTER TABLE "orden_pagos" DROP CONSTRAINT "orden_pagos_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "orden_pagos" DROP CONSTRAINT "orden_pagos_userId_fkey";

-- DropForeignKey
ALTER TABLE "orden_pedidos" DROP CONSTRAINT "orden_pedidos_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_invoices" DROP CONSTRAINT "purchase_invoices_purchaseId_fkey";

-- DropForeignKey
ALTER TABLE "recibos" DROP CONSTRAINT "recibos_bankAccountId_fkey";

-- DropForeignKey
ALTER TABLE "supplier_account_movements" DROP CONSTRAINT "supplier_account_movements_ordenPagoId_fkey";

-- DropForeignKey
ALTER TABLE "supplier_account_movements" DROP CONSTRAINT "supplier_account_movements_purchaseId_fkey";

-- DropForeignKey
ALTER TABLE "supplier_account_movements" DROP CONSTRAINT "supplier_account_movements_supplierId_fkey";

-- DropIndex
DROP INDEX "afip_config_companyId_idx";

-- DropIndex
DROP INDEX "brands_companyId_idx";

-- DropIndex
DROP INDEX "brands_name_key";

-- DropIndex
DROP INDEX "budgets_companyId_idx";

-- DropIndex
DROP INDEX "cash_registers_companyId_idx";

-- DropIndex
DROP INDEX "categories_companyId_idx";

-- DropIndex
DROP INDEX "customers_companyId_idx";

-- DropIndex
DROP INDEX "invoices_companyId_idx";

-- DropIndex
DROP INDEX "orden_compras_companyId_idx";

-- DropIndex
DROP INDEX "orden_compras_date_idx";

-- DropIndex
DROP INDEX "orden_compras_status_idx";

-- DropIndex
DROP INDEX "orden_compras_supplierId_idx";

-- DropIndex
DROP INDEX "orden_pago_items_opId_idx";

-- DropIndex
DROP INDEX "orden_pagos_companyId_idx";

-- DropIndex
DROP INDEX "orden_pagos_supplierId_idx";

-- DropIndex
DROP INDEX "orden_pedidos_companyId_idx";

-- DropIndex
DROP INDEX "products_companyId_idx";

-- DropIndex
DROP INDEX "purchase_invoices_companyId_idx";

-- DropIndex
DROP INDEX "purchase_invoices_dueDate_idx";

-- DropIndex
DROP INDEX "purchase_invoices_purchaseId_idx";

-- DropIndex
DROP INDEX "purchases_companyId_idx";

-- DropIndex
DROP INDEX "recibos_companyId_idx";

-- DropIndex
DROP INDEX "remitos_companyId_idx";

-- DropIndex
DROP INDEX "supplier_acct_companyId_idx";

-- DropIndex
DROP INDEX "supplier_acct_purchaseId_idx";

-- DropIndex
DROP INDEX "supplier_acct_suppId_idx";

-- DropIndex
DROP INDEX "suppliers_companyId_idx";

-- DropIndex
DROP INDEX "users_email_key";

-- DropIndex
DROP INDEX "warehouses_companyId_idx";

-- AlterTable
ALTER TABLE "app_settings" DROP COLUMN "mpAccessToken",
DROP COLUMN "mpMode",
DROP COLUMN "mpPublicKey",
DROP COLUMN "mpWebhookSecret",
DROP COLUMN "printFormat",
DROP COLUMN "smtpFrom",
DROP COLUMN "smtpHost",
DROP COLUMN "smtpPass",
DROP COLUMN "smtpPort",
DROP COLUMN "smtpSecure",
DROP COLUMN "smtpUser",
DROP COLUMN "stalePriceWarnDays1",
DROP COLUMN "stalePriceWarnDays2";

-- AlterTable
ALTER TABLE "bank_accounts" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "bank_movements" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "card_surcharges" ALTER COLUMN "surchargePercent" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "cards" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "companies" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "name" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "orden_compra_items" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "taxRate" DROP DEFAULT;

-- AlterTable
ALTER TABLE "orden_compras" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "subtotal" DROP DEFAULT,
ALTER COLUMN "taxAmount" DROP DEFAULT,
ALTER COLUMN "total" DROP DEFAULT,
DROP COLUMN "currency",
ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'ARS',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "orden_pago_items" DROP COLUMN "purchaseInvoiceId";

-- AlterTable
ALTER TABLE "orden_pagos" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "orden_pedidos" DROP COLUMN "warehouseId";

-- AlterTable
ALTER TABLE "purchase_invoices" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "dueDate" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "recibos" DROP COLUMN "bankAccountId",
DROP COLUMN "mpPaymentId",
DROP COLUMN "mpPreferenceId";

-- AlterTable
ALTER TABLE "supplier_account_movements" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "invoice_afip_errors";

-- DropTable
DROP TABLE "mp_preferences";

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compras" ADD CONSTRAINT "orden_compras_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compras" ADD CONSTRAINT "orden_compras_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compras" ADD CONSTRAINT "orden_compras_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compras" ADD CONSTRAINT "orden_compras_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compra_items" ADD CONSTRAINT "orden_compra_items_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "orden_compras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compra_items" ADD CONSTRAINT "orden_compra_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_pagos" ADD CONSTRAINT "orden_pagos_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_pagos" ADD CONSTRAINT "orden_pagos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_pagos" ADD CONSTRAINT "orden_pagos_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_pago_items" ADD CONSTRAINT "orden_pago_items_ordenPagoId_fkey" FOREIGN KEY ("ordenPagoId") REFERENCES "orden_pagos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_pago_items" ADD CONSTRAINT "orden_pago_items_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_account_movements" ADD CONSTRAINT "supplier_account_movements_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_account_movements" ADD CONSTRAINT "supplier_account_movements_ordenPagoId_fkey" FOREIGN KEY ("ordenPagoId") REFERENCES "orden_pagos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_account_movements" ADD CONSTRAINT "supplier_account_movements_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
