-- La cuenta corriente de proveedores mezclaba movimientos de distintas monedas
-- en una sola sumatoria (ver getSupplierBalance / createSupplierMovement):
-- una factura en USD generaba un DEBIT con el valor nominal en USD, y el pago
-- (Orden de Pago) generaba un CREDIT con el importe convertido a ARS. Al
-- sumarlos sin distinguir moneda, el saldo quedaba completamente distorsionado.
--
-- Fix de fondo (código): el saldo y el balance corriente ahora se calculan
-- SIEMPRE agrupados por "currency". Esta migración:
--   1) Relaja el UNIQUE de "ordenPagoId" (una OP que paga facturas en más de
--      una moneda ahora puede generar un movimiento por moneda).
--   2) Reconstruye los movimientos históricos generados por Órdenes de Pago
--      que tengan ítems, separándolos por la moneda de la factura que pagan
--      (en vez de un único monto en la moneda de liquidación de la OP).
--   3) Recalcula el estado (PENDING/PARTIALLY_PAID/PAID) de las facturas de
--      compra, comparando lo pagado en la moneda propia de cada factura.
--   4) Recalcula el "balance" corriente de cada movimiento, ahora particionado
--      por (supplierId, currency) en vez de global.

-- 1) Relajar el UNIQUE de ordenPagoId ------------------------------------------
ALTER TABLE "supplier_account_movements" DROP CONSTRAINT IF EXISTS "supplier_account_movements_ordenPagoId_key";
CREATE INDEX IF NOT EXISTS "supplier_account_movements_ordenPagoId_idx" ON "supplier_account_movements"("ordenPagoId");

-- 2) Reconstruir movimientos de Órdenes de Pago con ítems ----------------------
-- Snapshot del movimiento original por OP (antes del UNIQUE solo podía existir
-- una fila por ordenPagoId) — preserva supplierId/companyId/fiscalMode/createdAt.
CREATE TEMP TABLE _sam_orig AS
SELECT DISTINCT ON (sam."ordenPagoId")
  sam."ordenPagoId", sam."supplierId", sam."companyId", sam."fiscalMode",
  sam."createdAt", sam.description
FROM "supplier_account_movements" sam
WHERE sam."ordenPagoId" IS NOT NULL
ORDER BY sam."ordenPagoId", sam."createdAt" ASC;

-- Monto imputado a cada factura, convertido a la moneda DE LA FACTURA (no a la
-- moneda de liquidación de la OP): si coinciden, sin cambios; si no, se
-- reconstruye el monto original dividiendo por la cotización usada en la OP.
CREATE TEMP TABLE _sam_by_currency AS
SELECT
  opi."ordenPagoId",
  COALESCE(pi.currency, 'ARS') AS currency,
  SUM(
    CASE WHEN COALESCE(pi.currency, 'ARS') = op.currency
         THEN opi.amount
         ELSE opi.amount / NULLIF(op."exchangeRate", 0)
    END
  ) AS amount
FROM "orden_pago_items" opi
JOIN "orden_pagos" op ON op.id = opi."ordenPagoId"
LEFT JOIN "purchase_invoices" pi ON pi.id = opi."purchaseInvoiceId"
WHERE op.status = 'PAID'
GROUP BY opi."ordenPagoId", COALESCE(pi.currency, 'ARS');

-- Ajustes (descuentos/intereses) netos: no están atados a una factura puntual,
-- quedan en la moneda de liquidación de la propia OP.
CREATE TEMP TABLE _sam_ajustes AS
SELECT
  a."ordenPagoId",
  op.currency,
  SUM(CASE WHEN a.type = 'SUMA' THEN a.amount ELSE -a.amount END) AS amount
FROM "orden_pago_ajustes" a
JOIN "orden_pagos" op ON op.id = a."ordenPagoId"
WHERE op.status = 'PAID'
GROUP BY a."ordenPagoId", op.currency
HAVING SUM(CASE WHEN a.type = 'SUMA' THEN a.amount ELSE -a.amount END) <> 0;

-- Borra los movimientos originales (mezclados) de toda OP que tenga ítems
-- (las OP "pago a cuenta", sin ítems, no tenían este problema y quedan intactas).
DELETE FROM "supplier_account_movements" sam
USING (SELECT DISTINCT "ordenPagoId" FROM "orden_pago_items") x
WHERE sam."ordenPagoId" = x."ordenPagoId";

-- Reinserta un movimiento CREDIT por moneda de factura efectivamente pagada.
INSERT INTO "supplier_account_movements"
  (id, "supplierId", "ordenPagoId", type, amount, currency, balance, description, "companyId", "fiscalMode", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text, o."supplierId", f."ordenPagoId", 'CREDIT', f.amount, f.currency, 0,
  o.description, o."companyId", COALESCE(o."fiscalMode", 'FORMAL'), o."createdAt", o."createdAt"
FROM _sam_by_currency f
JOIN _sam_orig o ON o."ordenPagoId" = f."ordenPagoId"
WHERE f.amount > 0;

-- Reinserta el neto de ajustes (si hubo) como movimiento aparte, en la moneda de la OP.
INSERT INTO "supplier_account_movements"
  (id, "supplierId", "ordenPagoId", type, amount, currency, balance, description, "companyId", "fiscalMode", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text, o."supplierId", a."ordenPagoId",
  CASE WHEN a.amount >= 0 THEN 'CREDIT' ELSE 'DEBIT' END,
  ABS(a.amount), a.currency, 0,
  TRIM(BOTH ' ' FROM COALESCE(o.description, '') || ' (ajustes)'),
  o."companyId", COALESCE(o."fiscalMode", 'FORMAL'), o."createdAt", o."createdAt"
FROM _sam_ajustes a
JOIN _sam_orig o ON o."ordenPagoId" = a."ordenPagoId";

DROP TABLE _sam_orig;
DROP TABLE _sam_by_currency;
DROP TABLE _sam_ajustes;

-- 3) Recalcular estado de facturas de compra comparando en su propia moneda ---
UPDATE "purchase_invoices" pi
SET status = CASE
      WHEN paid.total <= 0               THEN 'PENDING'
      WHEN paid.total < pi.amount - 0.01  THEN 'PARTIALLY_PAID'
      ELSE 'PAID'
    END,
    "updatedAt" = NOW()
FROM (
  SELECT
    opi."purchaseInvoiceId",
    SUM(
      CASE WHEN COALESCE(pi2.currency, 'ARS') = op.currency
           THEN opi.amount
           ELSE opi.amount / NULLIF(op."exchangeRate", 0)
      END
    ) AS total
  FROM "orden_pago_items" opi
  JOIN "orden_pagos" op ON op.id = opi."ordenPagoId" AND op.status = 'PAID'
  LEFT JOIN "purchase_invoices" pi2 ON pi2.id = opi."purchaseInvoiceId"
  WHERE opi."purchaseInvoiceId" IS NOT NULL
  GROUP BY opi."purchaseInvoiceId"
) paid
WHERE pi.id = paid."purchaseInvoiceId"
  AND pi.status IN ('PENDING', 'PARTIALLY_PAID', 'PAID');

-- 4) Recalcular el balance corriente, particionado por (supplierId, currency) --
WITH ordered AS (
  SELECT
    id,
    SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE -amount END)
      OVER (PARTITION BY "supplierId", currency ORDER BY "createdAt", id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
  FROM "supplier_account_movements"
)
UPDATE "supplier_account_movements" sam
SET balance = ordered.running_balance
FROM ordered
WHERE ordered.id = sam.id;
