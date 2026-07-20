-- Depósito elegible en la venta: la factura y la orden de pedido guardan de
-- qué depósito descontar/reservar stock (NULL = depósito por defecto).
-- Las órdenes de pedido ya aceptaban warehouseId en el request pero no lo
-- persistían: las reversas de reserva caían siempre en el depósito por defecto.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;
ALTER TABLE "orden_pedidos" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orden_pedidos" ADD CONSTRAINT "orden_pedidos_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
