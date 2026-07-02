-- MercadoPago QR presencial (posnet): external id de la caja (POS) creada en el panel de MP.
-- Se usa para generar órdenes QR dinámicas vía /instore/orders/qr.
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "mpPosId" TEXT;
