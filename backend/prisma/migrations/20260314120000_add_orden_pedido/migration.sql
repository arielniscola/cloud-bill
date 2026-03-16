-- CreateTable
CREATE TABLE "orden_pedidos" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'ARS',
    "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "paymentTerms" TEXT,
    "saleCondition" TEXT NOT NULL DEFAULT 'CONTADO',
    "stockBehavior" TEXT NOT NULL DEFAULT 'DISCOUNT',
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "orden_pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_pedido_items" (
    "id" TEXT NOT NULL,
    "ordenPedidoId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "orden_pedido_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orden_pedidos_number_key" ON "orden_pedidos"("number");

-- AddColumn to recibos
ALTER TABLE "recibos" ADD COLUMN "ordenPedidoId" TEXT;

-- AddColumn to account_movements
ALTER TABLE "account_movements" ADD COLUMN "ordenPedidoId" TEXT;

-- AddForeignKey
ALTER TABLE "orden_pedidos" ADD CONSTRAINT "orden_pedidos_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orden_pedidos" ADD CONSTRAINT "orden_pedidos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orden_pedidos" ADD CONSTRAINT "orden_pedidos_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orden_pedido_items" ADD CONSTRAINT "orden_pedido_items_ordenPedidoId_fkey" FOREIGN KEY ("ordenPedidoId") REFERENCES "orden_pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orden_pedido_items" ADD CONSTRAINT "orden_pedido_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recibos" ADD CONSTRAINT "recibos_ordenPedidoId_fkey" FOREIGN KEY ("ordenPedidoId") REFERENCES "orden_pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_ordenPedidoId_fkey" FOREIGN KEY ("ordenPedidoId") REFERENCES "orden_pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
