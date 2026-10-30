-- Historial de precios y costos de productos.
--
-- Lo escribe un TRIGGER sobre products: así queda registrado cualquier cambio
-- de cost / price / costUSD / salePriceUSD, venga del camino que venga
-- (edición, actualización masiva, importación, recálculo USD, factura de compra).
--
-- Quién y por qué: el que escribe estampa en la MISMA sentencia las columnas
-- "priceCtx*" de products (origen, usuario, referencia). El trigger las copia al
-- historial y las vuelve a NULL, así nunca quedan pegadas para el próximo cambio.
-- Sin estampa, el cambio igual se registra con origen OTHER.
--
-- `ref` agrupa una operación (una actualización masiva, una importación, una
-- factura de compra): es lo que permite deshacerla entera.

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "priceCtxSource" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "priceCtxUserId" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "priceCtxRef"    TEXT;

CREATE TABLE IF NOT EXISTS "product_price_history" (
  "id"              TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "productId"       TEXT         NOT NULL,
  "companyId"       TEXT         NOT NULL,
  "userId"          TEXT,
  -- CREATE | MANUAL | BULK | IMPORT | USD_RECALC | PURCHASE_INVOICE | REVERT | OTHER
  "source"          TEXT         NOT NULL,
  "ref"             TEXT,
  "oldCost"         DECIMAL(12,2),
  "newCost"         DECIMAL(12,2),
  "oldPrice"        DECIMAL(12,2),
  "newPrice"        DECIMAL(12,2),
  "oldCostUSD"      DECIMAL(12,2),
  "newCostUSD"      DECIMAL(12,2),
  "oldSalePriceUSD" DECIMAL(12,2),
  "newSalePriceUSD" DECIMAL(12,2),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("id"),
  -- DEFERRABLE: en el alta el trigger (BEFORE INSERT) escribe antes que exista la fila del producto.
  CONSTRAINT "product_price_history_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS "idx_price_history_product_created" ON "product_price_history" ("productId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_price_history_company_ref"     ON "product_price_history" ("companyId", "ref");
CREATE INDEX IF NOT EXISTS "idx_price_history_company_created" ON "product_price_history" ("companyId", "createdAt" DESC);

CREATE OR REPLACE FUNCTION products_price_history() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "product_price_history"
      ("productId", "companyId", "userId", "source", "ref",
       "newCost", "newPrice", "newCostUSD", "newSalePriceUSD")
    VALUES
      (NEW.id, NEW."companyId", NEW."priceCtxUserId", COALESCE(NEW."priceCtxSource", 'CREATE'), NEW."priceCtxRef",
       NEW.cost, NEW.price, NEW."costUSD", NEW."salePriceUSD");
  ELSIF NEW.cost           IS DISTINCT FROM OLD.cost
     OR NEW.price          IS DISTINCT FROM OLD.price
     OR NEW."costUSD"      IS DISTINCT FROM OLD."costUSD"
     OR NEW."salePriceUSD" IS DISTINCT FROM OLD."salePriceUSD" THEN
    INSERT INTO "product_price_history"
      ("productId", "companyId", "userId", "source", "ref",
       "oldCost", "newCost", "oldPrice", "newPrice",
       "oldCostUSD", "newCostUSD", "oldSalePriceUSD", "newSalePriceUSD")
    VALUES
      (NEW.id, NEW."companyId", NEW."priceCtxUserId", COALESCE(NEW."priceCtxSource", 'OTHER'), NEW."priceCtxRef",
       OLD.cost, NEW.cost, OLD.price, NEW.price,
       OLD."costUSD", NEW."costUSD", OLD."salePriceUSD", NEW."salePriceUSD");
  END IF;
  NEW."priceCtxSource" := NULL;
  NEW."priceCtxUserId" := NULL;
  NEW."priceCtxRef"    := NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_products_price_history" ON "products";
CREATE TRIGGER "trg_products_price_history"
  BEFORE INSERT OR UPDATE ON "products"
  FOR EACH ROW EXECUTE FUNCTION products_price_history();
