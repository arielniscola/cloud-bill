-- ============================================================================
-- Secuencias atómicas de numeración de comprobantes
--
-- PROBLEMA QUE RESUELVE
-- Cada repositorio numeraba con un read-then-write (`MAX(number)+1` o
-- `COUNT(*)+1`) fuera de toda transacción y, en varios casos, sin filtrar por
-- "companyId". Eso producía tres fallas:
--   1. Race condition: dos altas simultáneas leían el mismo último número y
--      generaban el mismo comprobante.
--   2. Fuga entre empresas: la numeración de facturas, presupuestos, remitos,
--      recibos, órdenes y notas internas era global, así que la empresa B
--      tomaba el número siguiente al de la empresa A y quedaban huecos en la
--      correlatividad (inaceptable para ARCA).
--   3. COUNT(*)+1 REPETÍA números ya emitidos si se borraba o anulaba un doc.
--
-- SOLUCIÓN
-- Una tabla de secuencias por (companyId, docType, year) que se incrementa con
-- un UPDATE ... RETURNING atómico —el mismo patrón que ya usaba
-- PrismaChequeraRepository para numerar cheques propios.
--
-- NOTA: la numeración fiscal de ARCA (PdvService) NO se toca. Esa ya es
-- correcta: usa FECompUltimoAutorizado como fuente de verdad bajo un advisory
-- lock por (pdv, tipo). Esta tabla numera el identificador INTERNO del
-- documento, que es cosa distinta.
-- ============================================================================

CREATE TABLE "document_sequences" (
    "id"          TEXT    NOT NULL,
    "companyId"   TEXT    NOT NULL,
    "docType"     TEXT    NOT NULL,
    "year"        INTEGER NOT NULL,
    "nextNumber"  INTEGER NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_sequences_companyId_docType_year_key"
    ON "document_sequences" ("companyId", "docType", "year");

-- El contador nunca puede retroceder ni arrancar en cero.
ALTER TABLE "document_sequences"
    ADD CONSTRAINT "document_sequences_nextNumber_positive" CHECK ("nextNumber" >= 1);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Sembramos cada secuencia con MAX(seq)+1 de los documentos que YA existen, por
-- empresa y por año, para que la numeración continúe donde estaba en lugar de
-- reiniciarse y chocar con lo ya emitido.
--
-- Se toma MAX y no COUNT: si se anuló un documento, COUNT devolvería un número
-- ya usado.
--
-- Año y secuencia se extraen con un regexp anclado al FINAL del número, no con
-- split_part por posición: hay prefijos con guion adentro ("OC-CONV-2026-0001")
-- donde contar campos desde la izquierda daría 'CONV' como año.
-- Los números que no matchean el formato (importados/legacy) se ignoran y no
-- frenan la migración.

CREATE OR REPLACE FUNCTION pg_temp.seed_sequence(
    p_doc_type   TEXT,
    p_prefix     TEXT,
    p_source_sql TEXT   -- debe proyectar las columnas "companyId" y "number"
) RETURNS VOID AS $$
BEGIN
    EXECUTE format($fmt$
        INSERT INTO "document_sequences" ("id", "companyId", "docType", "year", "nextNumber", "createdAt", "updatedAt")
        SELECT
            gen_random_uuid()::text,
            s."companyId",
            %L,
            (regexp_match(s.number, '-([0-9]{4})-([0-9]+)$'))[1]::int,
            MAX((regexp_match(s.number, '-([0-9]{4})-([0-9]+)$'))[2]::int) + 1,
            NOW(),
            NOW()
        FROM (%s) s
        WHERE s."companyId" IS NOT NULL
          AND s.number ~ ('^' || %L || '-[0-9]{4}-[0-9]+$')
        GROUP BY s."companyId", (regexp_match(s.number, '-([0-9]{4})-([0-9]+)$'))[1]::int
        ON CONFLICT ("companyId", "docType", "year") DO UPDATE
            SET "nextNumber" = GREATEST("document_sequences"."nextNumber", EXCLUDED."nextNumber")
    $fmt$, p_doc_type, p_source_sql, p_prefix);
END;
$$ LANGUAGE plpgsql;

-- Facturas y notas de venta: una secuencia por letra/tipo, como venía funcionando.
SELECT pg_temp.seed_sequence('INVOICE_FA',  'FA',  'SELECT "companyId", number FROM "invoices"');
SELECT pg_temp.seed_sequence('INVOICE_FB',  'FB',  'SELECT "companyId", number FROM "invoices"');
SELECT pg_temp.seed_sequence('INVOICE_FC',  'FC',  'SELECT "companyId", number FROM "invoices"');
SELECT pg_temp.seed_sequence('INVOICE_NCA', 'NCA', 'SELECT "companyId", number FROM "invoices"');
SELECT pg_temp.seed_sequence('INVOICE_NCB', 'NCB', 'SELECT "companyId", number FROM "invoices"');
SELECT pg_temp.seed_sequence('INVOICE_NCC', 'NCC', 'SELECT "companyId", number FROM "invoices"');
SELECT pg_temp.seed_sequence('INVOICE_NDA', 'NDA', 'SELECT "companyId", number FROM "invoices"');
SELECT pg_temp.seed_sequence('INVOICE_NDB', 'NDB', 'SELECT "companyId", number FROM "invoices"');
SELECT pg_temp.seed_sequence('INVOICE_NDC', 'NDC', 'SELECT "companyId", number FROM "invoices"');

-- Ventas
SELECT pg_temp.seed_sequence('BUDGET',        'PRES', 'SELECT "companyId", number FROM "budgets"');
SELECT pg_temp.seed_sequence('REMITO',        'REM',  'SELECT "companyId", number FROM "remitos"');
SELECT pg_temp.seed_sequence('RECIBO',        'REC',  'SELECT "companyId", number FROM "recibos"');
SELECT pg_temp.seed_sequence('ORDEN_PEDIDO',  'OP',   'SELECT "companyId", number FROM "orden_pedidos"');

-- Compras
SELECT pg_temp.seed_sequence('ORDEN_PAGO',        'OP',      'SELECT "companyId", number FROM "orden_pagos"');
SELECT pg_temp.seed_sequence('ORDEN_COMPRA',      'OC',      'SELECT "companyId", number FROM "orden_compras"');
SELECT pg_temp.seed_sequence('PURCHASE_REMITO',   'RC',      'SELECT "companyId", number FROM "purchase_remitos"');
SELECT pg_temp.seed_sequence('PURCHASE_COMP',     'COMP',    'SELECT "companyId", number FROM "purchases"');
SELECT pg_temp.seed_sequence('PURCHASE_NCC',      'NCC',     'SELECT "companyId", number FROM "purchases"');
SELECT pg_temp.seed_sequence('PURCHASE_NDC',      'NDC',     'SELECT "companyId", number FROM "purchases"');
-- La compra generada al convertir una Orden de Compra vive en la misma tabla
-- pero lleva su propio prefijo, con guion adentro.
SELECT pg_temp.seed_sequence('ORDEN_COMPRA_CONV', 'OC-CONV', 'SELECT "companyId", number FROM "purchases"');

-- Finanzas y contabilidad
SELECT pg_temp.seed_sequence('CHEQUE',        'CHQ', 'SELECT "companyId", number FROM "cheques"');
SELECT pg_temp.seed_sequence('JOURNAL_ENTRY', 'ASI', 'SELECT "companyId", number FROM "journal_entries"');
SELECT pg_temp.seed_sequence('INTERNAL_NOTE', 'NI',  'SELECT "companyId", number FROM "internal_notes"');
-- El certificado de retención no vive en una columna "number" ni lleva companyId
-- propio: cuelga de la Orden de Pago.
SELECT pg_temp.seed_sequence('RETENTION', 'RET',
    'SELECT op."companyId" AS "companyId", ret.certificate AS number
       FROM "orden_pago_retenciones" ret
       JOIN "orden_pagos" op ON op.id = ret."ordenPagoId"');
