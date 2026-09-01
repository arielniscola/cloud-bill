-- Amplía discountPct de DECIMAL(5,2) a DECIMAL(12,8).
--
-- El descuento global en pesos se guarda como el porcentaje equivalente por
-- ítem, y ese porcentaje casi nunca es redondo: $50.000 sobre $375.000 da
-- 13,3333…%, que con escala 2 se truncaba a 13,33.
--
-- El total del comprobante salía bien igualmente, porque el repositorio calcula
-- con el valor sin truncar ANTES de escribir. El problema aparecía después: al
-- reabrir y volver a guardar, updateWithItems recalculaba desde el 13,33 ya
-- truncado y el total se movía solo (~$125 sobre esos $375.000).
--
-- Cuánta escala hace falta: el error del porcentaje guardado es 0,5 × 10^-escala,
-- y en pesos eso es base × 0,5 × 10^-escala / 100. Para que quede por debajo del
-- centavo (0,005) se necesita base < 10^(escala-3) × 10. Con escala 8 eso cubre
-- líneas de hasta ~$100.000.000, muy por encima de cualquier caso real.
-- (Con escala 4 —lo primero que probé— una línea de $375.000 ya erraba 19 ¢.)
--
-- Precisión 12 con escala 8 deja 4 dígitos enteros: hasta 9999,99999999 %.
-- La conversión es un ensanche del tipo: los valores existentes entran sin pérdida.

ALTER TABLE "invoice_items"           ALTER COLUMN "discountPct" TYPE DECIMAL(12, 8);
ALTER TABLE "orden_pedido_items"      ALTER COLUMN "discountPct" TYPE DECIMAL(12, 8);
ALTER TABLE "recurring_invoice_items" ALTER COLUMN "discountPct" TYPE DECIMAL(12, 8);
