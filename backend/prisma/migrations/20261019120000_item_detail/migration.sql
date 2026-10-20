-- Detalle libre por ítem: texto que el usuario agrega a una línea de un
-- producto no inventariado (servicio) en factura, presupuesto y orden de
-- pedido. Se imprime debajo del nombre del producto. Viaja al convertir
-- presupuesto/OP → factura.
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "detail" TEXT;
ALTER TABLE "budget_items" ADD COLUMN IF NOT EXISTS "detail" TEXT;
ALTER TABLE "orden_pedido_items" ADD COLUMN IF NOT EXISTS "detail" TEXT;
