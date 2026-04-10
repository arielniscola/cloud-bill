-- purchase_invoice_items
CREATE TABLE "purchase_invoice_items" (
  "id"                TEXT          NOT NULL,
  "purchaseInvoiceId" TEXT          NOT NULL,
  "description"       TEXT          NOT NULL,
  "quantity"          DECIMAL(12,4) NOT NULL DEFAULT 1,
  "unitPrice"         DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxRate"           DECIMAL(5,2)  NOT NULL DEFAULT 21,
  "subtotal"          DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxAmount"         DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total"             DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_invoice_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_invoice_items_invoiceId_fkey"
    FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE
);

-- purchase_invoice_retenciones
CREATE TABLE "purchase_invoice_retenciones" (
  "id"                TEXT          NOT NULL,
  "purchaseInvoiceId" TEXT          NOT NULL,
  "type"              TEXT          NOT NULL DEFAULT 'IIBB',   -- IIBB | GANANCIAS | IVA | OTHER
  "jurisdiction"      TEXT,                                    -- province (IIBB only)
  "base"              DECIMAL(12,2) NOT NULL DEFAULT 0,
  "percentage"        DECIMAL(7,4)  NOT NULL DEFAULT 0,
  "amount"            DECIMAL(12,2) NOT NULL DEFAULT 0,
  "certificate"       TEXT,
  "notes"             TEXT,
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_invoice_retenciones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_invoice_retenciones_invoiceId_fkey"
    FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE
);
