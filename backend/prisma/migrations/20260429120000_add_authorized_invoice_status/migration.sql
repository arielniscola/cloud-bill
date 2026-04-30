-- Add AUTHORIZED to InvoiceStatus enum (issued + has CAE from ARCA)
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'AUTHORIZED';
