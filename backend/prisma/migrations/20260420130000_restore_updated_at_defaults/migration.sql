-- Restore updatedAt defaults dropped by 20260407002131_add_cards migration.
-- Prisma's @updatedAt is client-side only; raw SQL INSERTs need a DB default.

ALTER TABLE "bank_accounts"               ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "bank_movements"              ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "card_surcharges"             ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "cards"                       ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "companies"                   ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "orden_compras"               ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "orden_pagos"                 ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "purchase_invoices"           ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "supplier_account_movements"  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
