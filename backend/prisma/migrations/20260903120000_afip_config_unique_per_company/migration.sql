-- La configuración de ARCA (certificado + clave privada + CUIT) es POR EMPRESA.
-- Antes existía la posibilidad de tener más de una fila activa por empresa (y el
-- backend leía con findFirst sin filtrar por companyId), lo que permitía que una
-- empresa emitiera con el certificado de otra.

-- 1. Desactivar duplicados: se conserva la fila activa más reciente por empresa.
UPDATE "afip_config" a
SET "isActive" = false
WHERE a."isActive" = true
  AND a.id <> (
    SELECT b.id
    FROM "afip_config" b
    WHERE b."companyId" = a."companyId"
      AND b."isActive" = true
    ORDER BY b."updatedAt" DESC, b."createdAt" DESC, b.id
    LIMIT 1
  );

-- 2. Una sola configuración activa por empresa.
CREATE UNIQUE INDEX IF NOT EXISTS "afip_config_companyId_active_key"
  ON "afip_config" ("companyId")
  WHERE "isActive" = true;
