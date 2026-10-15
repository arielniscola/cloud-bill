-- La migración 20260407002131_add_cards borró lo que había creado
-- 20260328120000_add_mercadopago (tabla mp_preferences y las columnas de MP en
-- recibos) y nada lo volvió a crear: una base armada desde las migraciones
-- quedaba sin MercadoPago. Todo va con IF NOT EXISTS: donde ya existe no cambia nada.

ALTER TABLE "recibos"
  ADD COLUMN IF NOT EXISTS "mpPaymentId"    TEXT,
  ADD COLUMN IF NOT EXISTS "mpPreferenceId" TEXT;

CREATE TABLE IF NOT EXISTS "mp_preferences" (
  "id"                TEXT          NOT NULL PRIMARY KEY,
  "preferenceId"      TEXT          NOT NULL UNIQUE,
  "externalReference" TEXT          NOT NULL,
  "type"              TEXT          NOT NULL DEFAULT 'INVOICE',
  "amount"            DECIMAL(12,2) NOT NULL,
  "customerId"        TEXT          NOT NULL,
  "userId"            TEXT          NOT NULL,
  "cashRegisterId"    TEXT,
  "notes"             TEXT,
  "status"            TEXT          NOT NULL DEFAULT 'PENDING',
  "companyId"         TEXT          NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_mp_preferences_external_ref" ON "mp_preferences" ("externalReference");

-- Un pago de MP genera a lo sumo un recibo. El código ya serializa el alta con
-- un lock por pago; el índice es la última barrera. Si quedaron duplicados de
-- antes no se puede crear: se avisa y se sigue, para no trabar el deploy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "recibos" WHERE "mpPaymentId" IS NOT NULL
    GROUP BY "mpPaymentId" HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Hay recibos con mpPaymentId repetido: no se crea recibos_mpPaymentId_key. Revisarlos y crear el índice a mano.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "recibos_mpPaymentId_key" ON "recibos" ("mpPaymentId") WHERE "mpPaymentId" IS NOT NULL;
  END IF;
END $$;
