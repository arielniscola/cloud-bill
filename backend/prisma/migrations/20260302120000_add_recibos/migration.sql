-- AlterEnum: Add PARTIALLY_PAID and PAID to BudgetStatus
ALTER TYPE "BudgetStatus" ADD VALUE 'PARTIALLY_PAID';
ALTER TYPE "BudgetStatus" ADD VALUE 'PAID';

-- AlterTable: Add reciboId to AccountMovement
ALTER TABLE "account_movements" ADD COLUMN "reciboId" TEXT;
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_reciboId_key" UNIQUE ("reciboId");

-- CreateTable: Recibo
CREATE TABLE "recibos" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" TEXT,
    "budgetId" TEXT,
    "customerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cashRegisterId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "paymentMethod" TEXT NOT NULL,
    "reference" TEXT,
    "bank" TEXT,
    "checkDueDate" TIMESTAMP(3),
    "installments" INTEGER,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'EMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recibos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recibos_number_key" ON "recibos"("number");

-- AddForeignKey
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_reciboId_fkey" FOREIGN KEY ("reciboId") REFERENCES "recibos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
