-- Add plan to companies
-- Default PRO for backward compatibility (existing companies keep all current features)
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT 'PRO';
