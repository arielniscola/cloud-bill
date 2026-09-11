-- Descuentos en facturas de compra: por ítem y global del comprobante.
--
-- Son dos modos EXCLUYENTES de cargar el descuento:
--   · GLOBAL   -> vive en purchase_invoices.discountPct/discountAmount. Las
--                 líneas quedan a precio de lista (su discountPct es 0) y el
--                 descuento se resta UNA sola vez sobre el total, como en la
--                 factura de papel.
--   · POR ÍTEM -> cada purchase_invoice_items lleva su propio discountPct y la
--                 cabecera no descuenta nada (discountAmount = 0).
--
-- En los dos casos el descuento reduce la BASE IMPONIBLE, nunca el total ya
-- calculado:
--   item.subtotal  = cantidad * precioUnit - descuentoDeLaLinea
--   invoice.subtotal = SUM(item.subtotal) - invoice.discountAmount   <-- invariante
--   invoice.taxAmount = IVA sobre ese neto (el descuento global se prorratea
--                       por alícuota, no por línea)
--
-- El Libro IVA (IvaController) reconstruye el neto por alícuota desde los
-- ítems y prorratea el descuento de cabecera, así que informa el neto real.

ALTER TABLE "purchase_invoice_items"
  ADD COLUMN IF NOT EXISTS "discountPct"    DECIMAL(12,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "purchase_invoices"
  ADD COLUMN IF NOT EXISTS "discountPct"    DECIMAL(12,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
