-- Venta a Consumidor Final (sin cliente): nombre y documento del comprador
-- cargados a mano en la factura / orden de pedido. Se imprimen en el
-- comprobante y, si hay documento, se informan a ARCA (DNI = DocTipo 96).
ALTER TABLE "invoices"      ADD COLUMN IF NOT EXISTS "buyerName"     TEXT;
ALTER TABLE "invoices"      ADD COLUMN IF NOT EXISTS "buyerDocument" TEXT;
ALTER TABLE "orden_pedidos" ADD COLUMN IF NOT EXISTS "buyerName"     TEXT;
ALTER TABLE "orden_pedidos" ADD COLUMN IF NOT EXISTS "buyerDocument" TEXT;
