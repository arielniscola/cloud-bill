ALTER TABLE "orden_pedidos"
  ADD COLUMN IF NOT EXISTS "warehouseId" TEXT REFERENCES "warehouses"(id) ON DELETE SET NULL;
