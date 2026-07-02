-- AlterTable products: add trackStock
-- Cuando es false, el producto NO maneja inventario (servicios / ítems no inventariados):
-- no se validan ni generan movimientos de stock al facturar, remitir o comprar.
ALTER TABLE "products" ADD COLUMN "trackStock" BOOLEAN NOT NULL DEFAULT true;
