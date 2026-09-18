-- Configuración por empresa: si la casilla "Registrar pago al crear" arranca
-- tildada en la factura de venta y en la orden de pedido. Por defecto no, que
-- es el comportamiento que había hasta ahora.
ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "defaultRegisterPaymentInvoice"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "defaultRegisterPaymentOrdenPedido" BOOLEAN NOT NULL DEFAULT false;
