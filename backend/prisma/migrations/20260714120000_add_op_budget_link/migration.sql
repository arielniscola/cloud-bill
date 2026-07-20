-- Trazabilidad Presupuesto → Orden de Pedido: al generar la OP desde un
-- presupuesto se marcaba CONVERTED pero no quedaba registrado en qué OP
-- terminó. Sin este vínculo la cadena presupuesto → orden → factura no se
-- puede navegar.
ALTER TABLE "orden_pedidos" ADD COLUMN IF NOT EXISTS "budgetId" TEXT;

ALTER TABLE "orden_pedidos" ADD CONSTRAINT "orden_pedidos_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
