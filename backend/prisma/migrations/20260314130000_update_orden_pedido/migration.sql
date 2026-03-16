-- Add cashRegisterId and invoiceCashRegisterId to orden_pedidos
ALTER TABLE "orden_pedidos" ADD COLUMN "cashRegisterId" TEXT;
ALTER TABLE "orden_pedidos" ADD COLUMN "invoiceCashRegisterId" TEXT;

-- Add ordenPedidoId to invoices
ALTER TABLE "invoices" ADD COLUMN "ordenPedidoId" TEXT;

-- Add ordenPedidoId to remitos
ALTER TABLE "remitos" ADD COLUMN "ordenPedidoId" TEXT;

-- FK constraints
ALTER TABLE "orden_pedidos" ADD CONSTRAINT "orden_pedidos_cashRegisterId_fkey"
  FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orden_pedidos" ADD CONSTRAINT "orden_pedidos_invoiceCashRegisterId_fkey"
  FOREIGN KEY ("invoiceCashRegisterId") REFERENCES "cash_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_ordenPedidoId_fkey"
  FOREIGN KEY ("ordenPedidoId") REFERENCES "orden_pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "remitos" ADD CONSTRAINT "remitos_ordenPedidoId_fkey"
  FOREIGN KEY ("ordenPedidoId") REFERENCES "orden_pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
