-- Suscripciones Web Push (PWA): una por navegador/dispositivo. El endpoint es
-- único: si otro usuario inicia sesión en el mismo navegador, la fila pasa a
-- ser suya (upsert por endpoint), así nadie recibe los avisos del anterior.
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "companyId"  TEXT,
  "endpoint"   TEXT NOT NULL,
  "p256dh"     TEXT NOT NULL,
  "auth"       TEXT NOT NULL,
  "userAgent"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key" ON "push_subscriptions" ("endpoint");
CREATE INDEX IF NOT EXISTS "idx_push_subscriptions_user" ON "push_subscriptions" ("userId");
