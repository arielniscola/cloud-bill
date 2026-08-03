-- Las retenciones dejan de cargarse en la factura de compra: solo se practican
-- al pagar (orden_pago_retenciones), que es el momento que corresponde
-- legalmente. Ver también 20260728120000_add_supplier_retentions.
--
-- DESTRUCTIVO: elimina las retenciones cargadas históricamente en facturas y
-- sus certificados. Hacer backup antes de aplicar.

-- 1) Movimientos de cuenta corriente derivados de esas retenciones (los generaba
--    syncPurchaseInvoiceMovements con descripción "Retenciones <nº factura>").
--    Sin ellos, la factura queda adeudada por el bruto, como corresponde ahora.
DELETE FROM "supplier_account_movements"
WHERE "purchaseInvoiceId" IS NOT NULL
  AND description LIKE 'Retenciones %';

-- 2) La tabla de retenciones de factura
DROP TABLE IF EXISTS "purchase_invoice_retenciones";
