-- AlterTable: add warehouseId to purchases
ALTER TABLE "purchases" ADD COLUMN "warehouseId" TEXT;

-- AlterTable: add productId to purchase_items
ALTER TABLE "purchase_items" ADD COLUMN "productId" TEXT;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
