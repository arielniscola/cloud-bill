-- CreateTable product_custom_fields (definitions)
CREATE TABLE "product_custom_fields" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "options" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_custom_fields_pkey" PRIMARY KEY ("id")
);

-- Unique key per company
CREATE UNIQUE INDEX "product_custom_fields_companyId_key_key" ON "product_custom_fields"("companyId", "key");

-- CreateTable product_custom_field_values
CREATE TABLE "product_custom_field_values" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_custom_field_values_pkey" PRIMARY KEY ("id")
);

-- Unique value per product+field
CREATE UNIQUE INDEX "product_custom_field_values_productId_fieldId_key" ON "product_custom_field_values"("productId", "fieldId");

-- AddForeignKey product -> values
ALTER TABLE "product_custom_field_values" ADD CONSTRAINT "product_custom_field_values_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey field -> values
ALTER TABLE "product_custom_field_values" ADD CONSTRAINT "product_custom_field_values_fieldId_fkey"
    FOREIGN KEY ("fieldId") REFERENCES "product_custom_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
