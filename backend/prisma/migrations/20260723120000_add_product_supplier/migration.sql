-- Proveedor habitual del producto (para poder filtrar el catálogo por
-- proveedor, ej. en la actualización masiva). Antes solo se derivaba de
-- compras históricas (purchase_items), que dejaron de completarse con el
-- flujo de factura de compra standalone — por eso se agrega un campo directo.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "products" ADD CONSTRAINT "products_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "idx_products_supplierId" ON "products"("supplierId");
