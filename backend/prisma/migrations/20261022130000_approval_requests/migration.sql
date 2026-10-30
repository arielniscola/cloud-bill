-- Solicitudes de aprobación: las acciones protegidas (anular factura, remito,
-- recibo, NC/ND, devolución, movimiento de caja) que pide alguien que no es
-- Dueño quedan PENDING con el request original en `payload`; al aprobarse se
-- re-ejecuta ese request. Lo que ejecuta un Dueño queda como autoaprobado.
CREATE TABLE IF NOT EXISTS "approval_requests" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "action"        TEXT NOT NULL,                     -- INVOICE_CANCEL | INVOICE_DELETE | NOTE_CANCEL | ...
  "entityType"    TEXT NOT NULL,                     -- INVOICE | REMITO | PURCHASE_REMITO | RECIBO | CASH_MOVEMENT
  "entityId"      TEXT NOT NULL,
  "entityLabel"   TEXT,                              -- número del comprobante, para mostrar aunque se borre
  "routeKey"      TEXT NOT NULL,                     -- qué endpoint re-ejecutar
  "payload"       JSONB NOT NULL DEFAULT '{}',       -- params / body / query / fiscalMode del request original
  "reason"        TEXT,
  "status"        TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING | EXECUTING | APPROVED | REJECTED | FAILED
  "autoApproved"  BOOLEAN NOT NULL DEFAULT false,
  "requestedById" TEXT,
  "resolvedById"  TEXT,
  "resolvedAt"    TIMESTAMP(3),
  "resolutionComment" TEXT,
  "errorMessage"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "approval_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "approval_requests_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_approval_requests_company_status" ON "approval_requests" ("companyId", "status", "createdAt" DESC);
-- Una sola solicitud viva por documento: es lo que lo bloquea.
CREATE UNIQUE INDEX IF NOT EXISTS "approval_requests_one_open_per_entity"
  ON "approval_requests" ("companyId", "entityType", "entityId")
  WHERE "status" IN ('PENDING', 'EXECUTING');

-- Acciones protegidas apagadas por empresa. Se guarda lo desactivado para que
-- una acción nueva del catálogo nazca protegida.
CREATE TABLE IF NOT EXISTS "approval_settings" (
  "companyId"       TEXT NOT NULL,
  "disabledActions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_settings_pkey" PRIMARY KEY ("companyId")
);
