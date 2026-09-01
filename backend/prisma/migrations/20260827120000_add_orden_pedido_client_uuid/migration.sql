-- Idempotencia de ventas cargadas sin conexión (PWA offline).
--
-- El navegador genera un UUID por venta ANTES de intentar subirla y lo manda
-- como Idempotency-Key. El unique es lo que hace que un reintento sobre un
-- envío que en realidad sí había llegado no cree una segunda orden.
ALTER TABLE "orden_pedidos" ADD COLUMN IF NOT EXISTS "clientUuid" TEXT;

-- Unique parcial: sólo aplica a las filas que traen clientUuid, así las
-- órdenes creadas online (que no lo llevan) no chocan entre sí por NULL.
CREATE UNIQUE INDEX IF NOT EXISTS "orden_pedidos_clientUuid_key"
  ON "orden_pedidos" ("clientUuid")
  WHERE "clientUuid" IS NOT NULL;
