-- purchase_invoice_tributos: "Otros tributos" que SUMAN al total del comprobante
-- (percepciones, impuestos internos, otros), a diferencia de las retenciones que restan.
CREATE TABLE IF NOT EXISTS "purchase_invoice_tributos" (
  "id"                TEXT          NOT NULL,
  "purchaseInvoiceId" TEXT          NOT NULL,
  "type"              TEXT          NOT NULL DEFAULT 'PERCEPCION_IVA', -- PERCEPCION_IVA | PERCEPCION_IIBB | IMPUESTOS_INTERNOS | OTRO
  "jurisdiction"      TEXT,                                           -- provincia (Percepción IIBB)
  "base"              DECIMAL(12,2) NOT NULL DEFAULT 0,
  "percentage"        DECIMAL(7,4)  NOT NULL DEFAULT 0,
  "amount"            DECIMAL(12,2) NOT NULL DEFAULT 0,
  "description"       TEXT,
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_invoice_tributos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_invoice_tributos_invoiceId_fkey"
    FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_purchase_invoice_tributos_invoiceId"
  ON "purchase_invoice_tributos" ("purchaseInvoiceId");
