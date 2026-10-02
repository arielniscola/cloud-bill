-- Configuración por empresa: tipo de factura que se preselecciona al crear un
-- comprobante. 'AUTO' mantiene el comportamiento de siempre (según la condición
-- fiscal de la empresa y del cliente); FACTURA_A/B/C lo fija.
ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "defaultInvoiceType" TEXT NOT NULL DEFAULT 'AUTO';
