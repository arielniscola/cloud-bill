-- CreateTable rubros
CREATE TABLE "rubros" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rubros_pkey" PRIMARY KEY ("id")
);

-- AlterTable products: add rubroId
ALTER TABLE "products" ADD COLUMN "rubroId" TEXT;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_rubroId_fkey"
    FOREIGN KEY ("rubroId") REFERENCES "rubros"("id") ON DELETE SET NULL ON UPDATE CASCADE;
