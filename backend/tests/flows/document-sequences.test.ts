import prisma from '../../src/infrastructure/database/prisma';
import {
  allocateDocumentNumber,
  allocateSequenceValue,
} from '../../src/infrastructure/database/DocumentSequence';

/**
 * La numeración de comprobantes tiene que sobrevivir a dos ventas simultáneas.
 *
 * Antes no lo hacía: cada repositorio resolvía el próximo número con un
 * `MAX(number)+1` o `COUNT(*)+1` leído fuera de transacción, así que dos altas
 * concurrentes leían el mismo último número y generaban el mismo comprobante.
 * Estos tests fijan el contrato nuevo.
 */

const COMPANY_A = '11111111-1111-1111-1111-111111111111';
const COMPANY_B = '22222222-2222-2222-2222-222222222222';
const YEAR = 2999; // año imposible: no colisiona con datos sembrados

async function resetSequences() {
  await prisma.$executeRaw`
    DELETE FROM "document_sequences"
    WHERE "companyId" IN (${COMPANY_A}, ${COMPANY_B}) AND "year" = ${YEAR}
  `;
}

describe('Secuencias de numeración de comprobantes', () => {
  beforeEach(resetSequences);
  afterAll(async () => {
    await resetSequences();
  });

  it('arranca en 1 y avanza de a uno', async () => {
    const uno = await allocateDocumentNumber('INVOICE_FB', COMPANY_A, { year: YEAR });
    const dos = await allocateDocumentNumber('INVOICE_FB', COMPANY_A, { year: YEAR });

    expect(uno).toBe('FB-2999-00000001');
    expect(dos).toBe('FB-2999-00000002');
  });

  it('no entrega el mismo número a dos pedidos concurrentes', async () => {
    // El caso que rompía: 50 emisiones en paralelo sobre la misma secuencia.
    const N = 50;
    const numeros = await Promise.all(
      Array.from({ length: N }, () =>
        allocateSequenceValue('INVOICE_FB', COMPANY_A, YEAR)
      )
    );

    expect(new Set(numeros).size).toBe(N);
    // Y sin huecos: 1..N exactos, que es lo que exige la correlatividad fiscal.
    expect([...numeros].sort((a, b) => a - b)).toEqual(
      Array.from({ length: N }, (_, i) => i + 1)
    );
  });

  it('lleva una correlatividad separada por empresa', async () => {
    const a1 = await allocateDocumentNumber('INVOICE_FB', COMPANY_A, { year: YEAR });
    const b1 = await allocateDocumentNumber('INVOICE_FB', COMPANY_B, { year: YEAR });
    const a2 = await allocateDocumentNumber('INVOICE_FB', COMPANY_A, { year: YEAR });

    // La empresa B no consume números de la empresa A: cada una arranca en 1.
    expect(a1).toBe('FB-2999-00000001');
    expect(b1).toBe('FB-2999-00000001');
    expect(a2).toBe('FB-2999-00000002');
  });

  it('lleva una correlatividad separada por tipo de comprobante', async () => {
    const fb = await allocateDocumentNumber('INVOICE_FB', COMPANY_A, { year: YEAR });
    const nc = await allocateDocumentNumber('INVOICE_NCB', COMPANY_A, { year: YEAR });

    expect(fb).toBe('FB-2999-00000001');
    expect(nc).toBe('NCB-2999-00000001');
  });

  it('distingue Orden de Pedido de Orden de Pago aunque compartan el prefijo OP-', async () => {
    const pedido = await allocateDocumentNumber('ORDEN_PEDIDO', COMPANY_A, { year: YEAR });
    const pago = await allocateDocumentNumber('ORDEN_PAGO', COMPANY_A, { year: YEAR });

    // Mismo prefijo visible, secuencias independientes (y padding propio).
    expect(pedido).toBe('OP-2999-0001');
    expect(pago).toBe('OP-2999-00000001');
  });

  it('devuelve el número al pool si la transacción se revierte', async () => {
    await allocateDocumentNumber('RECIBO', COMPANY_A, { year: YEAR });

    await expect(
      prisma.$transaction(async (tx) => {
        const dentro = await allocateDocumentNumber('RECIBO', COMPANY_A, { year: YEAR, tx });
        expect(dentro).toBe('REC-2999-00000002');
        throw new Error('rollback a propósito');
      })
    ).rejects.toThrow('rollback a propósito');

    // El 2 no se quemó: sin huecos en la correlatividad.
    const despues = await allocateDocumentNumber('RECIBO', COMPANY_A, { year: YEAR });
    expect(despues).toBe('REC-2999-00000002');
  });

  it('exige companyId', async () => {
    await expect(
      allocateDocumentNumber('INVOICE_FB', '', { year: YEAR })
    ).rejects.toThrow(/companyId/);
  });
});
