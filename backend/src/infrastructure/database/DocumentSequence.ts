import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from './prisma';

/**
 * Asignación atómica de números de comprobante.
 *
 * Reemplaza los `MAX(number)+1` y `COUNT(*)+1` que cada repositorio hacía por
 * su cuenta. Aquellos tenían tres fallas: eran un read-then-write sin lock (dos
 * ventas simultáneas obtenían el mismo número), casi ninguno filtraba por
 * empresa (la numeración se mezclaba entre inquilinos y dejaba huecos en la
 * correlatividad), y los basados en COUNT repetían números ya usados cuando se
 * anulaba un documento.
 *
 * Acá el número sale de un `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`:
 * una sola sentencia, que toma el row lock de la secuencia y lo sostiene hasta
 * el commit. Dos pedidos concurrentes de la misma (empresa, tipo, año) se
 * serializan; distintos tipos o empresas no se estorban.
 *
 * IMPORTANTE — pasá siempre el `tx` de la transacción que crea el documento.
 * Al vivir dentro de la misma transacción, un rollback devuelve el número al
 * pool en vez de quemarlo, que es lo que exige la correlatividad fiscal: sin
 * huecos. El costo es que la secuencia queda tomada mientras dure la
 * transacción, así que las transacciones que numeran tienen que ser cortas.
 *
 * NO cubre la numeración fiscal de ARCA (punto de venta + CAE): de eso se ocupa
 * `PdvService`, que ya numera correctamente contra `FECompUltimoAutorizado` bajo
 * un advisory lock. Esto numera el identificador INTERNO del documento.
 */

export const DOC_SEQUENCES = {
  INVOICE_FA:      { prefix: 'FA',   pad: 8 },
  INVOICE_FB:      { prefix: 'FB',   pad: 8 },
  INVOICE_FC:      { prefix: 'FC',   pad: 8 },
  INVOICE_NCA:     { prefix: 'NCA',  pad: 8 },
  INVOICE_NCB:     { prefix: 'NCB',  pad: 8 },
  INVOICE_NCC:     { prefix: 'NCC',  pad: 8 },
  INVOICE_NDA:     { prefix: 'NDA',  pad: 8 },
  INVOICE_NDB:     { prefix: 'NDB',  pad: 8 },
  INVOICE_NDC:     { prefix: 'NDC',  pad: 8 },
  BUDGET:          { prefix: 'PRES', pad: 4 },
  REMITO:          { prefix: 'REM',  pad: 8 },
  RECIBO:          { prefix: 'REC',  pad: 8 },
  // OrdenPedido y OrdenPago comparten el prefijo visible "OP-" pero son
  // documentos distintos: por eso la clave de secuencia no es el prefijo.
  ORDEN_PEDIDO:    { prefix: 'OP',   pad: 4 },
  ORDEN_PAGO:      { prefix: 'OP',   pad: 8 },
  ORDEN_COMPRA:    { prefix: 'OC',   pad: 4 },
  INTERNAL_NOTE:   { prefix: 'NI',   pad: 8 },
  PURCHASE_REMITO: { prefix: 'RC',   pad: 4 },
  CHEQUE:          { prefix: 'CHQ',  pad: 6 },
  JOURNAL_ENTRY:   { prefix: 'ASI',  pad: 6 },
  RETENTION:       { prefix: 'RET',  pad: 4 },
  // Compras: la misma tabla `purchases` guarda la compra y sus NC/ND, cada
  // una con su prefijo. NCC/NDC repiten el prefijo de las notas de VENTA,
  // pero son tablas distintas y por eso la clave de secuencia es distinta.
  PURCHASE_COMP:   { prefix: 'COMP', pad: 4 },
  PURCHASE_NCC:    { prefix: 'NCC',  pad: 4 },
  PURCHASE_NDC:    { prefix: 'NDC',  pad: 4 },
  // Compra generada al convertir una Orden de Compra: prefijo con guion adentro.
  ORDEN_COMPRA_CONV: { prefix: 'OC-CONV', pad: 4 },
} as const;

export type DocType = keyof typeof DOC_SEQUENCES;

export interface AllocateOptions {
  /** Transacción del documento que se está creando. Pasala siempre que exista. */
  tx?: Prisma.TransactionClient;
  /** Año de la secuencia. Default: el año en curso. */
  year?: number;
}

/**
 * Reserva el próximo número de `docType` para `companyId` y lo devuelve
 * formateado, p. ej. `FA-2026-00000042`.
 */
export async function allocateDocumentNumber(
  docType: DocType,
  companyId: string,
  options: AllocateOptions = {}
): Promise<string> {
  const spec = DOC_SEQUENCES[docType];
  if (!spec) throw new Error(`Tipo de documento sin secuencia definida: ${docType}`);
  if (!companyId) throw new Error(`No se puede numerar ${docType} sin companyId`);

  const year = options.year ?? new Date().getFullYear();
  const seq = await allocateSequenceValue(docType, companyId, year, options.tx);

  return `${spec.prefix}-${year}-${String(seq).padStart(spec.pad, '0')}`;
}

/**
 * El incremento crudo, por si algún llamador necesita el entero sin formatear.
 *
 * En el alta se inserta `nextNumber = 2` y se devuelve `2 - 1 = 1`, de modo que
 * una secuencia nueva entrega el 1 y queda apuntando al 2. En el conflicto se
 * incrementa y se devuelve el valor previo, que es el primer número libre.
 */
export async function allocateSequenceValue(
  docType: DocType,
  companyId: string,
  year: number,
  tx?: Prisma.TransactionClient
): Promise<number> {
  const client = tx ?? prisma;

  const rows = await client.$queryRaw<{ assigned: number }[]>`
    INSERT INTO "document_sequences"
      ("id", "companyId", "docType", "year", "nextNumber", "createdAt", "updatedAt")
    VALUES
      (${randomUUID()}, ${companyId}, ${docType}, ${year}, 2, NOW(), NOW())
    ON CONFLICT ("companyId", "docType", "year") DO UPDATE
      SET "nextNumber" = "document_sequences"."nextNumber" + 1,
          "updatedAt"  = NOW()
    RETURNING "nextNumber" - 1 AS "assigned"
  `;

  const assigned = rows[0]?.assigned;
  if (assigned === undefined) {
    throw new Error(`No se pudo asignar número para ${docType} (empresa ${companyId})`);
  }
  return Number(assigned);
}

/**
 * Mapea el tipo de comprobante a su secuencia. Cada letra lleva su propia
 * correlatividad, tal como venía funcionando con los prefijos FA/FB/NCA/...
 */
export const INVOICE_DOC_TYPE: Record<string, DocType> = {
  FACTURA_A:      'INVOICE_FA',
  FACTURA_B:      'INVOICE_FB',
  FACTURA_C:      'INVOICE_FC',
  NOTA_CREDITO_A: 'INVOICE_NCA',
  NOTA_CREDITO_B: 'INVOICE_NCB',
  NOTA_CREDITO_C: 'INVOICE_NCC',
  NOTA_DEBITO_A:  'INVOICE_NDA',
  NOTA_DEBITO_B:  'INVOICE_NDB',
  NOTA_DEBITO_C:  'INVOICE_NDC',
};
