-- CreateTable
CREATE TABLE "cash_register_closes" (
    "id" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromDate" TIMESTAMP(3),
    "totalIn" DECIMAL(12,2) NOT NULL,
    "totalOut" DECIMAL(12,2) NOT NULL,
    "netTotal" DECIMAL(12,2) NOT NULL,
    "movementsCount" INTEGER NOT NULL,
    "notes" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_register_closes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cash_register_closes" ADD CONSTRAINT "cash_register_closes_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register_closes" ADD CONSTRAINT "cash_register_closes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
