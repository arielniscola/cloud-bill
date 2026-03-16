-- Add stockBehavior to invoices (DISCOUNT = default behavior, immediate stock deduction)
ALTER TABLE "invoices" ADD COLUMN "stockBehavior" TEXT NOT NULL DEFAULT 'DISCOUNT';

-- Add stockBehavior to budgets
ALTER TABLE "budgets" ADD COLUMN "stockBehavior" TEXT NOT NULL DEFAULT 'DISCOUNT';
