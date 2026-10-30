-- Producto de cada línea de la factura de compra. Hasta ahora era solo una
-- ayuda de carga en el formulario y se perdía al guardar. Se guarda para poder
-- actualizar el costo del producto con lo facturado por el proveedor (y, más
-- adelante, mostrar sus últimas compras). Nulo = línea libre, sin producto.
ALTER TABLE "purchase_invoice_items" ADD COLUMN IF NOT EXISTS "productId" TEXT;

DO $$ BEGIN
  ALTER TABLE "purchase_invoice_items"
    ADD CONSTRAINT "purchase_invoice_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_purchase_invoice_items_product"
  ON "purchase_invoice_items" ("productId");
